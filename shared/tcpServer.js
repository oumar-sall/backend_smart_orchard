require('dotenv').config();
const net = require('net');
const { EventEmitter } = require('events');
const { Controller, Component, Reading, Setting, ActivityLog } = require('../models');
const { PINS } = require('./enums');
const logger = require('./logger');

// New modules
const protocol = require('./galileo.protocol');
const IrrigationService = require('./irrigation.service');

const TCP_PORT = process.env.TCP_PORT || 5000;
const clients = new Map(); // IMEI -> Socket
const ackEmitter = new EventEmitter();
const commandQueues = new Map(); // imei -> { queue: [], isProcessing: false }

const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    socket.imei = null;
    socket.sessionBuffer = Buffer.alloc(0);

    socket.on('data', async (chunk) => {
        socket.sessionBuffer = Buffer.concat([socket.sessionBuffer, chunk]);

        let cursor = 0;
        while (cursor < socket.sessionBuffer.length) {
            // ACK detection (0x02 + 2 bytes CRC)
            if (socket.sessionBuffer[cursor] === 0x02) {
                if (cursor + 3 > socket.sessionBuffer.length) break;
                if (socket.imei) ackEmitter.emit(`ack_${socket.imei}`);
                socket.sessionBuffer = Buffer.concat([
                    socket.sessionBuffer.slice(0, cursor),
                    socket.sessionBuffer.slice(cursor + 3)
                ]);
                continue;
            }

            if (socket.sessionBuffer[cursor] !== 0x01) {
                cursor++;
                continue;
            }

            if (cursor + 3 > socket.sessionBuffer.length) break;
            const size = (socket.sessionBuffer[cursor + 1] | (socket.sessionBuffer[cursor + 2] << 8)) & 0x7FFF;
            const trameSize = size + 5;

            if (cursor + trameSize > socket.sessionBuffer.length) break;
            const trame = socket.sessionBuffer.slice(cursor, cursor + trameSize);

            // Bug shield: Delay ACK for text replies
            const isTextReply = (trame[3] === 0x03 || trame[3] === 0x04);
            const ackBuf = Buffer.concat([Buffer.from([0x02]), trame.slice(-2)]);
            logger.info(`[TCP] 📥 Received: ${trame.toString('hex').toUpperCase()}`);
            
            if (isTextReply && socket.imei) {
                logger.info(`[TCP] ⏳ Delaying ACK for text reply: ${ackBuf.toString('hex').toUpperCase()}`);
                socket.pendingAck = ackBuf;
                if (socket.ackTimeout) clearTimeout(socket.ackTimeout);
                socket.ackTimeout = setTimeout(() => {
                    if (socket.pendingAck) {
                        socket.write(socket.pendingAck);
                        logger.info(`[TCP] 📤 Sent Delayed ACK: ${socket.pendingAck.toString('hex').toUpperCase()}`);
                        socket.pendingAck = null;
                    }
                }, 1500);
            } else {
                socket.write(ackBuf);
                logger.info(`[TCP] 📤 Sent ACK: ${ackBuf.toString('hex').toUpperCase()}`);
            }

            try {
                const records = protocol.decodeGalileo(trame);
                
                if (isTextReply) {
                    const responseText = trame.slice(4, trame.length - 2).toString();
                    logger.info(`[TCP] 📥 Reply from ${socket.imei} : "${responseText}"`);
                    if (socket.imei) ackEmitter.emit(`ack_${socket.imei}`);
                }

                for (const data of records) {
                    if (data.imei && !socket.imei) {
                        socket.imei = data.imei;
                        clients.set(socket.imei, socket);
                        IrrigationService.restoreTimersOnReconnection(socket.imei, sendCommand);
                    }
                    if (!socket.imei) continue;

                    try {
                        const controller = await Controller.findOne({
                            where: { imei: socket.imei },
                            include: [{ model: Component, include: [Setting] }]
                        });

                        if (!controller) continue;

                        const recordDate = data.timestamp ? new Date(data.timestamp * 1000) : new Date();

                        for (const comp of controller.Components) {
                            if (comp.type !== 'sensor') continue;

                            const pinMap = {
                                'IN 0': data.v0 ?? data.in0, 'IN 1': data.v1 ?? data.in1,
                                'IN 2': data.v2 ?? data.in2, 'IN 3': data.v3 ?? data.in3,
                                'IN 4': data.v4, 'IN 5': data.v5,
                                'VOL 0': data.v0, 'VOL 1': data.v1, 'VOL 2': data.v2,
                                'VOL 3': data.v3, 'VOL 4': data.v4, 'VOL 5': data.v5,
                                '485 A': data.temp ?? data.temp1 ?? data.modbus0,
                                '485 B': data.hum ?? data.temp2 ?? data.modbus1,
                                '1-WIRE': data.tempW,
                            };

                            let rawValue;

                            // Si le composant a un tag Modbus spécifique (RS485)
                            if (comp.modbus_tag !== null && data.modbus && data.modbus[comp.modbus_tag] !== undefined) {
                                rawValue = data.modbus[comp.modbus_tag];
                                
                                // Normalisation : certains tags sont en millièmes (1, 2) d'autres en dixièmes (0x8980)
                                if (comp.modbus_tag === 1 || comp.modbus_tag === 2) {
                                    rawValue = rawValue / 1000;
                                } else {
                                    // Par défaut, la plupart des capteurs Modbus (comme le TZ-THT03R) utilisent 1 décimale (/10)
                                    rawValue = rawValue / 10;
                                }
                            } else {
                                rawValue = pinMap[comp.pin_number];
                            }

                            if (rawValue !== undefined) {
                                let finalValue = rawValue;
                                // Calibration logic
                                if ((comp.pin_number.startsWith('IN ') || comp.pin_number.startsWith('VOL ')) && comp.min_value !== null && comp.max_value !== null) {
                                    const vRecu = rawValue / 1000;
                                    const vMin = comp.v_min ?? 0;
                                    const vMax = comp.v_max ?? 10;
                                    const pMin = comp.min_value;
                                    const pMax = comp.max_value;
                                    if (vMax !== vMin) finalValue = pMin + ((vRecu - vMin) / (vMax - vMin)) * (pMax - pMin);
                                    finalValue = Math.round(finalValue * 10) / 10;
                                }

                                await Reading.create({ component_id: comp.id, value: finalValue, created_at: recordDate });

                                const isLatest = records.indexOf(data) === records.length - 1;
                                if (isLatest && (comp.pin_number === PINS.HUM || comp.label?.toLowerCase().includes('humidité'))) {
                                    await IrrigationService.runAutoIrrigationCheck(finalValue, comp.id, socket.imei, controller, sendCommand);
                                }
                            }
                        }
                    } catch (e) {
                        logger.error(`[DB] Processing error: ${e.message}`);
                    }
                }
            } catch (err) {
                logger.error(`❌ Decoding error: ${err.message}`);
            }
            cursor += trameSize;
        }
        if (cursor > 0) socket.sessionBuffer = socket.sessionBuffer.slice(cursor);
    });

    socket.on('close', () => {
        if (socket.imei) {
            clients.delete(socket.imei);
            // We could add a failsafe log here if needed
        }
    });

    socket.on('error', (err) => {
        if (socket.imei) clients.delete(socket.imei);
        logger.error(`❌ Socket error (IMEI: ${socket.imei || 'Unknown'}): ${err.message}`);
    });
});

function sendCommand(imei, command) {
    const socket = clients.get(imei);
    if (!socket) return false;

    if (!commandQueues.has(imei)) {
        commandQueues.set(imei, { queue: [], isProcessing: false });
    }

    const qc = commandQueues.get(imei);
    if (qc.queue.length === 0 && !qc.isProcessing) qc.queue.push("PING");
    qc.queue.push(command);
    
    processQueue(imei);
    return true;
}

async function processQueue(imei) {
    const qc = commandQueues.get(imei);
    if (!qc || qc.isProcessing || qc.queue.length === 0) return;

    qc.isProcessing = true;
    await new Promise(resolve => setTimeout(resolve, 500));

    while (qc.queue.length > 0) {
        const command = qc.queue.shift();
        const socket = clients.get(imei);

        if (socket) {
            try {
                let packet = protocol.packGalileoCommand(command, imei);
                if (socket.pendingAck) {
                    packet = Buffer.concat([packet, socket.pendingAck]);
                    socket.pendingAck = null;
                }
                socket.write(packet);
            } catch (err) {
                logger.error(`[TCP] Send error: ${err.message}`);
            }
        }

        await new Promise(resolve => {
            const timeoutId = setTimeout(() => {
                ackEmitter.removeAllListeners(`ack_${imei}`);
                resolve();
            }, 10000);
            ackEmitter.once(`ack_${imei}`, () => {
                clearTimeout(timeoutId);
                setTimeout(resolve, 1000);
            });
        });
    }
    qc.isProcessing = false;
}

function start() {
    server.listen(TCP_PORT, '0.0.0.0', () => logger.info(`🚀 TCP server listening on port ${TCP_PORT}`));
    setTimeout(() => IrrigationService.restoreTimersOnStartup(sendCommand), 2000);
}

module.exports = {
    sendCommand,
    clients,
    start
};

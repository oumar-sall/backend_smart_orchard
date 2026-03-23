require('dotenv').config();
const net = require('net');
const { Controller, Component, Reading, Setting } = require('../models');

const TCP_PORT = process.env.TCP_PORT || 5000;
const clients = new Map(); // IMEI -> Socket

function logSensorData(imei, temp, hum) {
    const time = new Date().toLocaleTimeString();
    console.log(`
    ┌──────────────────────────────────────────────────┐
    │ 🕒 ${time} - IMEI: ${imei}
    ├──────────────────────────────────────────────────┤
    │ 🌡️  Température : ${temp.toFixed(1)}°C
    │ 💧 Humidité     : ${hum.toFixed(1)}%
    └──────────────────────────────────────────────────┘
    `);
}

const server = net.createServer((socket) => {
    console.log(`📡 Nouveau boîtier connecté : ${socket.remoteAddress}`);
    socket.imei = null;
    socket.sessionBuffer = Buffer.alloc(0);

    socket.on('data', async (chunk) => {
        socket.sessionBuffer = Buffer.concat([socket.sessionBuffer, chunk]);

        let cursor = 0;
        while (cursor < socket.sessionBuffer.length) {
            if (socket.sessionBuffer[cursor] !== 0x01) {
                cursor++;
                continue;
            }

            if (cursor + 3 > socket.sessionBuffer.length) break;
            const size = (socket.sessionBuffer[cursor + 1] | (socket.sessionBuffer[cursor + 2] << 8)) & 0x7FFF;
            const trameSize = size + 5;

            if (cursor + trameSize > socket.sessionBuffer.length) break;

            const trame = socket.sessionBuffer.slice(cursor, cursor + trameSize);

            // ACK Immédiat
            socket.write(Buffer.concat([Buffer.from([0x02]), trame.slice(-2)]));

            try {
                const records = decodeGalileo(trame);
                // Analyse si la trame contient une réponse textuelle (Command ID 0x03 ou 0x04)
                if (trame[3] === 0x03 || trame[3] === 0x04) {
                    const responseText = trame.slice(4, trame.length - 2).toString();
                    console.log(`[TCP] 📥 Réponse du boîtier ${socket.imei} : "${responseText}"`);
                }
                for (const data of records) {
                    // Si on trouve l'IMEI dans cette trame, on le mémorise pour la session
                    if (data.imei) {
                        socket.imei = data.imei;
                        clients.set(socket.imei, socket);
                        console.log(`[TCP] IMEI ${socket.imei} associé à cette session. Clients actifs: ${clients.size}`);
                    }
                    if (!socket.imei) continue;

                    const finalTemp = data.temp ?? data.temp1 ?? data.modbus0;
                    const finalHum = data.hum ?? data.temp2 ?? data.modbus1;

                    if (finalTemp !== undefined || finalHum !== undefined) {
                        logSensorData(socket.imei, finalTemp || 0, finalHum || 0);

                        // Sauvegarde DB asynchrone
                        Controller.findOne({
                            where: { imei: socket.imei },
                            include: [{ model: Component }]
                        })
                            .then(async (controller) => {
                                if (!controller) {
                                    console.warn(`[DB] Contrôleur introuvable pour IMEI: ${socket.imei}`);
                                    return;
                                }

                                // Debug: voir les composants chargés
                                if (!controller.Components || controller.Components.length === 0) {
                                    console.warn(`[DB] ⚠️ Aucun composant trouvé pour le contrôleur ${controller.name} (ID: ${controller.id})`);
                                }

                                // Conversion du timestamp (secondes depuis 01/01/1970) en Date valide pour MySql
                                const recordDate = data.timestamp ? new Date(data.timestamp * 1000) : new Date();

                                if (finalTemp !== undefined) {
                                    // Cherche le composant selon l'origine de la valeur temp
                                    const tempPin = data.temp !== undefined ? 'temp' : (data.temp1 !== undefined ? 'temp1' : 'modbus0');
                                    let c = controller.Components.find(c => c.pin_number === tempPin);
                                    if (c) {
                                        await Reading.create({ component_id: c.id, value: finalTemp, created_at: recordDate });
                                        console.log(`[DB] ✅ Température insérée: ${finalTemp}°C (pin: ${tempPin})`);
                                    } else {
                                        console.warn(`[DB] ⚠️ Composant '${tempPin}' introuvable pour ce contrôleur (Total comps: ${controller.Components ? controller.Components.length : 0})`);
                                        if (controller.Components) {
                                            console.log(`[DB] Pins disponibles: ${controller.Components.map(comp => comp.pin_number).join(', ')}`);
                                        }
                                    }
                                }
                                if (finalHum !== undefined) {
                                    // Cherche le composant selon l'origine de la valeur hum
                                    const humPin = data.hum !== undefined ? 'hum' : (data.temp2 !== undefined ? 'temp2' : 'modbus1');
                                    let c = controller.Components.find(c => c.pin_number === humPin);
                                    if (c) {
                                        await Reading.create({ component_id: c.id, value: finalHum, created_at: recordDate });
                                        console.log(`[DB] ✅ Humidité insérée: ${finalHum}% (pin: ${humPin})`);
                                    } else {
                                        console.warn(`[DB] ⚠️ Composant '${humPin}' introuvable pour ce contrôleur (Total comps: ${controller.Components ? controller.Components.length : 0})`);
                                        if (controller.Components) {
                                            console.log(`[DB] Pins disponibles: ${controller.Components.map(comp => comp.pin_number).join(', ')}`);
                                        }
                                    }
                                }
                            }).catch(e => console.error("DB Error:", e.message));
                    }
                }
            } catch (err) {
                console.error("❌ Erreur décodage:", err.message);
            }
            cursor += trameSize;
        }
        if (cursor > 0) socket.sessionBuffer = socket.sessionBuffer.slice(cursor);
    });

    socket.on('close', () => {
        if (socket.imei) {
            clients.delete(socket.imei);
            console.log(`📡 Déconnexion boîtier (IMEI: ${socket.imei}). Clients restants: ${clients.size}`);
        }
    });

    socket.on('error', (err) => {
        if (socket.imei) clients.delete(socket.imei);
        console.error(`❌ Erreur socket (IMEI: ${socket.imei || 'Inconnu'}):`, err.message);
    });
});

function decodeGalileo(buffer) {
    const records = [];
    let offset = 3;
    const totalDataLength = buffer.length - 2;

    // On initialise avec un objet qui peut recevoir des données avant le timestamp
    let currentRecord = {};

    const tagSizes = {
        0x01: 1, 0x02: 1, 0x03: 15, 0x04: 2, 0x10: 2, 0x20: 4, 0x29: 1,
        0x30: 9, 0x33: 4, 0x34: 2, 0x35: 1, 0x3a: 2, 0x3b: 2,
        0x40: 2, 0x41: 2, 0x42: 2, 0x43: 2, 0x47: 1, 0x49: 1,
        0x50: 4, 0x51: 4, 0x52: 4, 0x60: 2, 0x61: 2, 0x90: 2, 0x91: 2
    };

    while (offset < totalDataLength) {
        const tag = buffer[offset++];

        switch (tag) {
            case 0x03: // IMEI
                currentRecord.imei = buffer.slice(offset, offset + 15).toString().replace(/[^\d]/g, '');
                offset += 15;
                break;

            case 0x20: // TIMESTAMP (Déclencheur de fin de record)
                // Si on a déjà un timestamp dans currentRecord, ça veut dire qu'on finit un bloc
                if (currentRecord.timestamp) {
                    records.push({ ...currentRecord });
                    // On garde l'IMEI pour le record suivant
                    const lastImei = currentRecord.imei;
                    currentRecord = { imei: lastImei };
                }
                currentRecord.timestamp = buffer.readUInt32LE(offset);
                offset += 4;
                break;

            case 0xFE: // DONNÉES MODBUS
                const feLength = buffer.readUInt16LE(offset);
                offset += 2;
                const endOfFeTag = offset + feLength;

                while (offset < endOfFeTag) {
                    const subTag = buffer.readUInt16LE(offset);
                    offset += 2;

                    // Support des variantes d'ID (8980, E489, etc.)
                    if (subTag === 0x8980 || subTag === 0xE489 || subTag === 0x89E4) {
                        currentRecord.temp = buffer.readInt32LE(offset) / 10;
                        offset += 4;
                    }
                    else if (subTag === 0x8981 || subTag === 0xE589 || subTag === 0x89E5) {
                        currentRecord.hum = buffer.readInt32LE(offset) / 10;
                        offset += 4;
                    }
                    else if (subTag === 1) {
                        currentRecord.temp = buffer.readInt32LE(offset) / 1000;
                        offset += 4;
                    }
                    else if (subTag === 2) {
                        currentRecord.hum = buffer.readInt32LE(offset) / 1000;
                        offset += 4;
                    }
                    else {
                        offset += 4;
                    }
                }
                // Securité: forcer l'offset à la fin du tag FE en cas de données corrompues ou sous-tags ignorés
                offset = endOfFeTag;
                break;

            case 0x90:
                currentRecord.modbus0 = buffer.readInt16LE(offset) / 10;
                offset += 2;
                break;

            case 0x91:
                currentRecord.modbus1 = buffer.readInt16LE(offset) / 10;
                offset += 2;
                break;

            default:
                if (tagSizes[tag] !== undefined) {
                    offset += tagSizes[tag];
                } else {
                    console.log(`[Warn] Tag inconnu ignoré: 0x${tag.toString(16)} à l'offset ${offset}`);
                    // Éviter la boucle infinie si on tombe sur un tag non géré
                    offset = totalDataLength;
                }
                break;
        }
    }

    // Ajout du dernier record collecté
    if (Object.keys(currentRecord).length > 0) {
        records.push(currentRecord);
    }
    console.log("Fin du while : ", records);
    return records;
}

/**
 * Envoie une commande au boîtier via sa socket active
 */
function sendCommand(imei, command) {
    const socket = clients.get(imei);
    if (!socket) return false;

    try {
        // ON ENCAPSULE LA COMMANDE AVEC L'IMEI
        const packet = packGalileoCommand(command, imei);
        socket.write(packet);

        console.log(`[TCP] 📤 Trame binaire envoyée à ${imei}: ${command}`);
        return true;
    } catch (err) {
        console.error(`[TCP] Erreur d'envoi:`, err.message);
        return false;
    }
}

server.listen(TCP_PORT, '0.0.0.0', () => console.log(`🚀 Serveur actif sur le port ${TCP_PORT}`));

// Fonction pour calculer le CRC16 Galileo
function calculateCRC16(buffer) {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc ^= buffer[i];
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x0001) !== 0) crc = (crc >> 1) ^ 0xA001;
            else crc >>= 1;
        }
    }
    return crc;
}

function packGalileoCommand(commandText, imei) {
    const textBuf = Buffer.from(commandText, 'ascii');
    const imeiBuf = Buffer.from(imei.padEnd(15, '\0'), 'ascii');

    // Construction du corps (tags)
    const body = Buffer.concat([
        Buffer.from([0x03]), imeiBuf,
        Buffer.from([0x04, 0x00, 0x00]), // Tag 0x04 ID Boîtier (par défaut 0)
        Buffer.from([0xE0, 0x00, 0x00, 0x00, 0x00]), // Tag 0xE0 Numéro commande (0)
        Buffer.from([0xE1, textBuf.length]), textBuf // Tag 0xE1 Texte commande
    ]);

    const size = body.length;
    const header = Buffer.alloc(3);
    header[0] = 0x01;
    header.writeUInt16LE(size, 1);

    const packet = Buffer.concat([header, body]);
    const crc = calculateCRC16(packet);
    const crcBuf = Buffer.alloc(2);
    crcBuf.writeUInt16LE(crc, 0);

    return Buffer.concat([packet, crcBuf]);
}


module.exports = {
    server,
    sendCommand,
    clients
};
require('dotenv').config();
const net = require('net');
const { EventEmitter } = require('events');
const { Controller, Component, Reading, Setting, ActivityLog } = require('../models');

const TCP_PORT = process.env.TCP_PORT || 5000;
const clients = new Map(); // IMEI -> Socket
const ackEmitter = new EventEmitter();



const server = net.createServer((socket) => {
    // console.log(`📡 Nouveau boîtier connecté : ${socket.remoteAddress}`);
    socket.setNoDelay(true); // Désactive l'algorithme de Nagle pour éviter la concaténation TCP via tunnel
    socket.imei = null;
    socket.sessionBuffer = Buffer.alloc(0);

    socket.on('data', async (chunk) => {
        socket.sessionBuffer = Buffer.concat([socket.sessionBuffer, chunk]);

        let cursor = 0;
        while (cursor < socket.sessionBuffer.length) {
            // Détection de l'ACK simple renvoyé par le boîtier (0x02 + 2 bytes CRC)
            if (socket.sessionBuffer[cursor] === 0x02) {
                if (cursor + 3 > socket.sessionBuffer.length) break; // Trame ACK incomplète
                if (socket.imei) ackEmitter.emit(`ack_${socket.imei}`);

                // On consomme cet ACK de 3 octets en l'enlevant du buffer
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

            // -------------------------------------------------------------
            // GESTION INTELLIGENTE DU BUG FIRMWARE GALILEOSKY (0x02)
            // -------------------------------------------------------------
            const isTextReply = (trame[3] === 0x03 || trame[3] === 0x04);
            const ackBuf = Buffer.concat([Buffer.from([0x02]), trame.slice(-2)]);
            
            if (isTextReply) {
                // On met l'ACK en attente. Si une commande est en file, elle l'emportera à la FIN de son buffer.
                // Sinon, on le purge automatiquement au bout de 1500ms.
                socket.pendingAck = ackBuf;
                if (socket.ackTimeout) clearTimeout(socket.ackTimeout);
                socket.ackTimeout = setTimeout(() => {
                    if (socket.pendingAck) {
                        socket.write(socket.pendingAck);
                        socket.pendingAck = null;
                    }
                }, 1500);
            } else {
                // ACK Immédiat pour la télémétrie classique (pas de risque de collision de commande)
                socket.write(ackBuf);
            }

            try {
                const records = decodeGalileo(trame);
                // Analyse si la trame contient une réponse textuelle (Command ID 0x03 ou 0x04)
                if (trame[3] === 0x03 || trame[3] === 0x04) {
                    const responseText = trame.slice(4, trame.length - 2).toString();
                    console.log(`[TCP] 📥 Réponse du boîtier ${socket.imei} : "${responseText}"`);
                    if (socket.imei) ackEmitter.emit(`ack_${socket.imei}`);
                }
                for (const data of records) {
                    // Si on trouve l'IMEI dans cette trame, on le mémorise pour la session
                    if (data.imei) {
                        socket.imei = data.imei;
                        clients.set(socket.imei, socket);
                        // console.log(`[TCP] IMEI ${socket.imei} associé à cette session. Clients actifs: ${clients.size}`);
                    }
                    if (!socket.imei) continue;

                    const finalTemp = data.temp ?? data.temp1 ?? data.modbus0;
                    const finalHum = data.hum ?? data.temp2 ?? data.modbus1;

                    console.log(`[TRAME] IMEI=${socket.imei} | temp=${finalTemp ?? 'N/A'} | hum=${finalHum ?? 'N/A'}`);

                    if (finalTemp !== undefined || finalHum !== undefined) {
                        // Sauvegarde DB (async/await)
                        try {
                            const controller = await Controller.findOne({
                                where: { imei: socket.imei },
                                include: [{
                                    model: Component,
                                    include: [Setting] // Important pour l'arrosage auto
                                }]
                            });

                            if (!controller) {
                                console.warn(`[DB] Contrôleur introuvable pour IMEI: ${socket.imei}`);
                                continue;
                            }

                            if (!controller.Components || controller.Components.length === 0) {
                                console.warn(`[DB] ⚠️ Aucun composant trouvé pour le contrôleur ${controller.name} (ID: ${controller.id})`);
                            }

                            // Conversion du timestamp (secondes depuis 01/01/1970) en Date valide pour MySql
                            const recordDate = data.timestamp ? new Date(data.timestamp * 1000) : new Date();

                            if (finalTemp !== undefined) {
                                const tempPin = data.temp !== undefined ? 'temp' : (data.temp1 !== undefined ? 'temp1' : 'modbus0');
                                const tempComp = controller.Components.find(c => c.pin_number === tempPin);
                                if (tempComp) {
                                    await Reading.create({ component_id: tempComp.id, value: finalTemp, created_at: recordDate });
                                } else {
                                    console.warn(`[DB] ⚠️ Composant '${tempPin}' introuvable (pins dispo: ${controller.Components.map(c => c.pin_number).join(', ')})`);
                                }
                            }

                            if (finalHum !== undefined) {
                                const humPin = data.hum !== undefined ? 'hum' : (data.temp2 !== undefined ? 'temp2' : 'modbus1');
                                const humComp = controller.Components.find(c => c.pin_number === humPin);

                                if (humComp) {
                                    await Reading.create({ component_id: humComp.id, value: finalHum, created_at: recordDate });

                                    // --- LOGIQUE D'ARROSAGE AUTOMATIQUE ---
                                    await runAutoIrrigationCheck(finalHum, humComp.id, socket.imei, controller);
                                } else {
                                    console.warn(`[DB] ⚠️ Composant hum '${humPin}' introuvable — logique d'arrosage auto ignorée pour ce cycle.`);
                                }
                            }
                        } catch (e) {
                            console.error('[DB] Erreur:', e.message);
                        }
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
        0x01: 1, 0x02: 1, 0x03: 15, 0x04: 2, 0x10: 2, 0x11: 1,
        0x14: 2, 0x15: 2, 0x20: 4, 0x29: 1, 0x30: 9, 0x33: 4,
        0x34: 2, 0x35: 1, 0x3a: 2, 0x3b: 2, 0x40: 2, 0x41: 2,
        0x42: 2, 0x43: 2, 0x47: 1, 0x49: 1, 0x50: 4, 0x51: 4,
        0x52: 4, 0x54: 2, 0x55: 1, 0x60: 2, 0x61: 2, 0x6E: 1,
        0x90: 2, 0x91: 2, 0xE0: 4
    };

    while (offset < totalDataLength) {
        const tag = buffer[offset++];

        switch (tag) {
            // ... (keep case 0x03 up to case 0xE1 unchanged)
            case 0x03: // IMEI
                currentRecord.imei = buffer.slice(offset, offset + 15).toString().replace(/[^\d]/g, '');
                offset += 15;
                break;

            case 0x20: // TIMESTAMP (Déclencheur de fin de record)
                if (currentRecord.timestamp) {
                    records.push({ ...currentRecord });
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
                    if (subTag === 0x8980 || subTag === 0xE489 || subTag === 0x89E4) {
                        currentRecord.temp = buffer.readInt32LE(offset) / 10;
                        offset += 4;
                    } else if (subTag === 0x8981 || subTag === 0xE589 || subTag === 0x89E5) {
                        currentRecord.hum = buffer.readInt32LE(offset) / 10;
                        offset += 4;
                    } else if (subTag === 1) {
                        currentRecord.temp = buffer.readInt32LE(offset) / 1000;
                        offset += 4;
                    } else if (subTag === 2) {
                        currentRecord.hum = buffer.readInt32LE(offset) / 1000;
                        offset += 4;
                    } else { offset += 4; }
                }
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

            case 0xE0: // État des entrées (Inputs)
                currentRecord.inputs = buffer.readUInt16LE(offset);
                offset += 2;
                break;

            case 0xE1: // Texte de commande (Réponse)
                const textLen = buffer[offset++];
                currentRecord.commandResponse = buffer.slice(offset, offset + textLen).toString();
                offset += textLen;
                break;

            case 0x00: // PADDING
                // On saute l'octet nul pour éviter une boucle infinie
                offset++;
                break;

            default:
                if (tagSizes[tag] !== undefined) {
                    offset += tagSizes[tag];
                } else {
                    console.log(`[Warn] Tag inconnu ignoré: 0x${tag.toString(16)} à l'offset ${offset}`);
                    // Éviter la boucle infinie: on considère que ce paquet est corrompu ou illisible après cet offset
                    offset = totalDataLength;
                }
                break;
        }
    }

    // Ajout du dernier record collecté
    if (Object.keys(currentRecord).length > 0) {
        records.push(currentRecord);
    }
    return records;
}

const commandQueues = new Map(); // imei -> { queue: [], isProcessing: false }

/**
 * Met en file d'attente une commande au boîtier et lance le traitement
 * Permet d'éviter d'envoyer plusieurs commandes TCP simultanées au Galileosky.
 */
function sendCommand(imei, command) {
    const socket = clients.get(imei);
    // Si la socket n'est pas trouvée (ex: boîtier hors ligne), on retourne quand même false
    if (!socket) return false;

    if (!commandQueues.has(imei)) {
        commandQueues.set(imei, { queue: [], isProcessing: false });
    }

    const qc = commandQueues.get(imei);
    
    // 🛡️ BOUCLIER ANTI-BUG (Idée de l'utilisateur)
    // Si on démarre une nouvelle session d'envoi de commandes, il est très probable que le réseau 
    // groupe l'ACK de télémétrie précédent avec notre première commande, ce qui la détruit chez Galileosky.
    // On injecte donc une commande fantôme "PING" sacrificielle qui absorbera le bug du boîtier.
    if (qc.queue.length === 0 && !qc.isProcessing) {
        qc.queue.push("PING");
        console.log(`[TCP] 🛡️ Commande fantôme PING injectée pour protéger la commande ${command}`);
    }

    qc.queue.push(command);
    console.log(`[TCP] ⏳ Commande "${command}" mise en file d'attente pour l'IMEI ${imei}. (Queue length: ${qc.queue.length})`);

    // Démarrage asynchrone pour ne pas bloquer l'exécution
    processQueue(imei);

    return true; // Accusé de réception (la commande partira)
}

/**
 * Traite la file d'attente TCP d'un boîtier spécifique (1 commande toutes les 2s)
 */
async function processQueue(imei) {
    const qc = commandQueues.get(imei);
    if (!qc || qc.isProcessing || qc.queue.length === 0) return;

    qc.isProcessing = true;

    // ⏱️ TEMPS DE RESPIRATION MATÉRIEL (Modem cellulaire)
    // Si le boîtier Galileosky vient d'envoyer sa télémétrie (et a reçu notre ACK),
    // son processeur et son modem 2G/LTE ont besoin de basculer d'Emission à Réception.
    // On attend 500ms avant de vider la file d'attente pour garantir qu'il écoute.
    await new Promise(resolve => setTimeout(resolve, 500));

    while (qc.queue.length > 0) {
        const command = qc.queue.shift();
        const socket = clients.get(imei);

        if (socket) {
            try {
                let packet = packGalileoCommand(command, imei);
                
                // Si un ACK est en attente, on le colle à la FIN de la commande.
                // C'est vital car le firmware Galileosky tronque le buffer s'il voit 0x02 en PREMIER octet.
                if (socket.pendingAck) {
                    packet = Buffer.concat([packet, socket.pendingAck]);
                    socket.pendingAck = null;
                    console.log(`[TCP] 🔗 ACK attaché en toute sécurité à la fin de la commande ${command}.`);
                }

                socket.write(packet);
                console.log(`[TCP] 📤 Trame binaire envoyée (depuis file d'attente) à ${imei}: ${command}`);
            } catch (err) {
                console.error(`[TCP] Erreur d'envoi:`, err.message);
            }
        } else {
            console.warn(`[TCP] Impossible d'envoyer la commande de la file d'attente (boîtier déconnecté) : ${command}`);
        }

        // ⏱️ TEMPORISATION INTELLIGENTE (ACK-BASED) AVEC TIMEOUT 1 SECONDE MAX
        // Le boîtier confirme la réception de la commande par un ACK (0x02) ou un message.
        // On attend l'ACK pour envoyer la suivante (avec 1 sec d'espacement forcé), ou 2 secondes maximum si l'ACK de ce tunnel est perdu.
        await new Promise(resolve => {
            const timeoutId = setTimeout(() => {
                ackEmitter.removeAllListeners(`ack_${imei}`);
                resolve();
            }, 10000);

            ackEmitter.once(`ack_${imei}`, () => {
                clearTimeout(timeoutId);
                // Le boîtier a acquitté, on respecte la volonté de 1 seconde d'écart pour éviter 
                // tout regroupement par le tunnel TCP (concaténation).
                setTimeout(resolve, 1000);
            });
        });
    }

    qc.isProcessing = false;
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
let globalCommandId = 1;

function packGalileoCommand(commandText, imei) {
    const textBuf = Buffer.from(commandText, 'ascii');
    const imeiBuf = Buffer.from(imei.padEnd(15, '\0'), 'ascii');

    const cmdIdBuf = Buffer.alloc(4);
    cmdIdBuf.writeUInt32LE(globalCommandId++, 0);

    // Construction du corps (tags)
    const body = Buffer.concat([
        Buffer.from([0x03]), imeiBuf,
        Buffer.from([0x04, 0x00, 0x00]), // Tag 0x04 ID Boîtier (par défaut 0)
        Buffer.from([0xE0]), cmdIdBuf,   // Tag 0xE0 Numéro commande (dynamique)
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


/**
 * Vérifie la condition de seuil et déclenche l'arrosage si nécessaire.
 * @param {number} humValue - Valeur d'humidité reçue (en %)
 * @param {string} humComponentId - ID du composant capteur ayant fourni la valeur
 * @param {string} imei - IMEI du boîtier
 * @param {object} controller - Instance Sequelize du Controller (avec Components + Settings chargés)
 */
async function runAutoIrrigationCheck(humValue, humComponentId, imei, controller) {
    for (const comp of controller.Components) {
        if (comp.type !== 'actuator' || !comp.Setting) continue;

        const autoMode = comp.Setting.auto_mode;
        const threshold = comp.Setting.threshold_min ?? 35;
        let isAlreadyActive = comp.timer_end && new Date(comp.timer_end) > new Date();
        const isLinkedSensor = !comp.Setting.sensor_id || comp.Setting.sensor_id === humComponentId;

        // Log systématique pour chaque vanne (même si elle ne déclenche pas)
        console.log(
            `[AUTO] ${comp.label} | auto=${autoMode} | hum=${humValue}% | seuil=${threshold}%` +
            ` | déjàActif=${!!isAlreadyActive} | capteurLié=${isLinkedSensor}`
        );

        if (!autoMode) continue;
        if (!isLinkedSensor) continue;

        // On recharge la vanne depuis la base de données pour éviter la race condition si l'utilisateur
        // clique 5 fois très vite sur le bouton "Simuler" sur l'app.
        const freshComp = await Component.findByPk(comp.id);
        const freshTimer = freshComp ? freshComp.timer_end : comp.timer_end;
        isAlreadyActive = freshTimer && new Date(freshTimer) > new Date();

        if (isAlreadyActive) { console.log(`[AUTO] ⏳ ${comp.label} déjà actif, on attend.`); continue; }

        if (humValue < threshold) {
            console.log(`[AUTO] 💧 ${humValue}% < ${threshold}% → Ouverture de ${comp.label}`);

            const cmd = `${comp.pin_number},0`; // 0 = OUVRIR
            const success = sendCommand(imei, cmd);

            if (!success) {
                console.warn(`[AUTO] ⚠️ boîtier ${imei} hors ligne, TCP non mis en file (mais sauvegarde DB maintenue pour simulation).`);
            }

            const duration = comp.Setting.irrigation_duration ?? 300;
            const timerEnd = new Date(Date.now() + duration * 1000);

            await comp.update({ timer_end: timerEnd });
            await ActivityLog.create({
                controller_id: controller.id,
                event_type: 'IRRIGATION_AUTO',
                description: `Démarrage auto: ${comp.label} (Hum: ${humValue}% < Seuil: ${threshold}%)`
            });

            // Fermeture auto après timer
            setTimeout(async () => {
                try {
                    const freshComp = await Component.findByPk(comp.id);
                    // Tolérance de 1000ms au cas où SQLite tronque les millisecondes lors de l'enregistrement !
                    if (freshComp && freshComp.timer_end && Math.abs(freshComp.timer_end.getTime() - timerEnd.getTime()) < 1000) {
                        sendCommand(imei, `${comp.pin_number},1`); // 1 = FERMER
                        await freshComp.update({ timer_end: null });
                        await ActivityLog.create({
                            controller_id: controller.id,
                            event_type: 'IRRIGATION_AUTO',
                            description: `Fermeture auto: ${comp.label}`
                        });
                        console.log(`[AUTO] 🔒 Fermeture auto de ${comp.label}`);
                    }
                } catch (err) {
                    console.error('[AUTO] Erreur fermeture auto:', err.message);
                }
            }, duration * 1000);
        } else {
            console.log(`[AUTO] ✅ ${humValue}% >= ${threshold}% → pas d'arrosage nécessaire.`);
        }
    }
}

module.exports = {
    server,
    sendCommand,
    clients,
    runAutoIrrigationCheck,
};

// -------------------------------------------------------------
// REPRISE DES FERMETURES AUTO APRÈS REDÉMARRAGE DU SERVEUR
// -------------------------------------------------------------
async function restoreTimersOnStartup() {
    try {
        const activeComps = await Component.findAll({
            where: { type: 'actuator' },
            include: [{ model: Controller }]
        });
        
        const now = Date.now();
        let restoredCount = 0;

        for (const comp of activeComps) {
            if (comp.timer_end) {
                const timerVal = comp.timer_end.getTime();
                if (timerVal > now) {
                    const remainingMs = timerVal - now;
                    setTimeout(async () => {
                        try {
                            const freshComp = await Component.findByPk(comp.id);
                            // On vérifie qu'il n'a pas été prolongé/modifié manuellement
                            if (freshComp && freshComp.timer_end && Math.abs(freshComp.timer_end.getTime() - timerVal) < 1000) {
                                sendCommand(comp.Controller.imei, `${comp.pin_number},1`); // 1 = FERMER
                                await freshComp.update({ timer_end: null });
                                console.log(`[AUTO] 🔒 Fermeture auto exécutée par récupération mémoire pour ${comp.label}`);
                            }
                        } catch (e) {
                            console.error('[TCP] Erreur récupération timer :', e.message);
                        }
                    }, remainingMs);
                    restoredCount++;
                } else {
                    // Le minuteur est périmé (le serveur était éteint trop longtemps), on ferme la vanne d'urgence !
                    console.log(`[TCP] ⚠️ Minuteur périmé détecté pour ${comp.label}. Ordre de fermeture forcé envoyé.`);
                    if(comp.Controller) {
                        sendCommand(comp.Controller.imei, `${comp.pin_number},1`);
                    }
                    await comp.update({ timer_end: null });
                }
            }
        }
        if (restoredCount > 0) {
            console.log(`[RECOVERY] ⏳ ${restoredCount} minuteurs d'arrosage auto récupérés et reprogrammés en mémoire !`);
        }
    } catch (err) {
        console.error(`[RECOVERY] Erreur récupération des timers:`, err.message);
    }
}

// Laisse 2 secondes pour s'assurer que sequelize a sync
setTimeout(restoreTimersOnStartup, 2000);
const net = require('net');

const TCP_PORT = 5000;

const server = net.createServer((socket) => {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`📡 Nouveau boîtier connecté : ${remoteAddress}`);

    socket.on('data', (buffer) => {
        console.log(`📥 Trame reçue de ${remoteAddress} :`);
        console.log(`   🔸 Hex : ${buffer.toString('hex').toUpperCase()}`);
        console.log(`   🔸 Taille : ${buffer.length} octets`);

        // --- ENVOI DE L'ACCUSÉ DE RÉCEPTION (ACK) ---
        if (buffer.length >= 3) {
            // Le checksum correspond aux deux derniers octets de la trame
            const checksum = buffer.slice(-2);

            // L'ACK est composé de 0x02 + les 2 octets de checksum
            const ack = Buffer.concat([Buffer.from([0x02]), checksum]);

            socket.write(ack, () => {
                console.log(`   ✅ ACK envoyé : ${ack.toString('hex').toUpperCase()}`);
            });
        }
        // --------------------------------------------

        console.log("🔍 Décodage en cours...");
        decodeGalileo(buffer);
    });

    socket.on('error', (err) => {
        console.error(`❌ Erreur sur la connexion ${remoteAddress} :`, err.message);
    });

    socket.on('close', () => {
        console.log(`🔌 Connexion fermée avec ${remoteAddress}`);
    });
});

function decodeGalileo(buffer) {
    let offset = 3; // On saute le Header (01) et la Taille (2 octets)
    const results = [];

    while (offset < buffer.length - 2) { // -2 pour ignorer le checksum à la fin
        const tag = buffer[offset];
        offset++;

        switch (tag) {
            case 0x01: // Hardware Version
                offset += 1; break;
            case 0x02: // Software Version
                offset += 1; break;
            case 0x03: // ID (IMEI)
                const imei = buffer.slice(offset, offset + 15).toString();
                console.log(`🆔 IMEI : ${imei}`);
                offset += 15; break;
            case 0x30: // Coordonnées GPS (Lat/Lon)
                // Le format est : 4 octets Lat, 4 octets Lon (degrés * 1 000 000)
                const lat = buffer.readInt32LE(offset) / 1000000;
                const lon = buffer.readInt32LE(offset + 4) / 1000000;
                console.log(`📍 GPS : ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                offset += 8; break;
            case 0x41: // Tension de la batterie (en mV)
                const voltage = buffer.readUInt16LE(offset);
                console.log(`🔋 Batterie : ${voltage / 1000}V`);
                offset += 2; break;
            case 0x20: // Date/Heure
                offset += 4; break;
            default:
                // Si on tombe sur un tag inconnu, on ne sait pas combien d'octets sauter.
                // Dans un vrai parseur, il faudrait tous les lister.
                offset++;
        }
    }
}

server.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur TCP en attente du Galileosky sur le port ${TCP_PORT}`);
});

module.exports = server;
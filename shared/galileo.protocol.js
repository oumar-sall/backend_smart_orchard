const logger = require('./logger');

/**
 * Calculates the CRC16 for GalileoSky protocol
 */
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

/**
 * Decodes a binary buffer into GalileoSky records
 */
function decodeGalileo(buffer) {
    const records = [];
    let offset = 3;
    const totalDataLength = buffer.length - 2;
    let currentRecord = {};

    const tagSizes = {
        0x01: 1, 0x02: 1, 0x03: 15, 0x04: 2, 0x10: 2, 0x11: 1,
        0x14: 2, 0x15: 2, 0x20: 4, 0x29: 1, 0x30: 9, 0x33: 4,
        0x34: 2, 0x35: 1, 0x3a: 2, 0x3b: 2, 0x40: 2, 0x41: 2,
        0x42: 2, 0x43: 2, 0x46: 2, 0x47: 1, 0x49: 1, 0x4a: 1, 
        0x4b: 1, 0x4c: 1, 0x50: 2, 0x51: 2, 0x52: 2, 0x53: 2, 
        0x54: 2, 0x55: 2, 0x58: 2, 0x59: 2, 0x5a: 2, 0x5b: 2, 
        0x5c: 2, 0x5d: 2, 0x5e: 2, 0x5f: 2, 0x60: 2, 0x61: 2, 
        0x6E: 1, 0x90: 2, 0x91: 2, 0xE0: 2
    };

    while (offset < totalDataLength) {
        const tag = buffer[offset++];

        switch (tag) {
            case 0x03: // IMEI
                currentRecord.imei = buffer.slice(offset, offset + 15).toString().replace(/[^\d]/g, '');
                offset += 15;
                break;

            case 0x20: // TIMESTAMP
                if (currentRecord.timestamp) {
                    records.push({ ...currentRecord });
                    const lastImei = currentRecord.imei;
                    currentRecord = { imei: lastImei };
                }
                currentRecord.timestamp = buffer.readUInt32LE(offset);
                offset += 4;
                break;

            case 0xFE: // MODBUS
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

            case 0x30:
                currentRecord.inputsStatus = buffer[offset++];
                currentRecord.in0 = buffer.readUInt16LE(offset); offset += 2;
                currentRecord.in1 = buffer.readUInt16LE(offset); offset += 2;
                currentRecord.in2 = buffer.readUInt16LE(offset); offset += 2;
                currentRecord.in3 = buffer.readUInt16LE(offset); offset += 2;
                break;

            case 0x50: currentRecord.v0 = buffer.readUInt16LE(offset); offset += 2; break;
            case 0x51: currentRecord.v1 = buffer.readUInt16LE(offset); offset += 2; break;
            case 0x52: currentRecord.v2 = buffer.readUInt16LE(offset); offset += 2; break;
            case 0x53: currentRecord.v3 = buffer.readUInt16LE(offset); offset += 2; break;
            case 0x54: currentRecord.v4 = buffer.readUInt16LE(offset); offset += 2; break;
            case 0x55: currentRecord.v5 = buffer.readUInt16LE(offset); offset += 2; break;

            case 0x90: currentRecord.modbus0 = buffer.readInt16LE(offset) / 10; offset += 2; break;
            case 0x91: currentRecord.modbus1 = buffer.readInt16LE(offset) / 10; offset += 2; break;

            case 0xE0: // Inputs status bitmask
                currentRecord.inputs = buffer.readUInt16LE(offset);
                offset += 2;
                break;

            case 0xE1: // Command response text
                const textLen = buffer[offset++];
                currentRecord.commandResponse = buffer.slice(offset, offset + textLen).toString();
                offset += textLen;
                break;

            case 0x00:
                offset++;
                break;

            default:
                if (tagSizes[tag] !== undefined) {
                    offset += tagSizes[tag];
                } else {
                    logger.warn(`[Protocol] Unknown tag: 0x${tag.toString(16)} at offset ${offset}`);
                    offset = totalDataLength;
                }
                break;
        }
    }

    if (Object.keys(currentRecord).length > 0) {
        records.push(currentRecord);
    }
    return records;
}

let globalCommandId = 1;

/**
 * Packs a text command into a binary GalileoSky packet
 */
function packGalileoCommand(commandText, imei) {
    const textBuf = Buffer.from(commandText, 'ascii');
    const imeiBuf = Buffer.from(imei.padEnd(15, '\0'), 'ascii');

    const cmdIdBuf = Buffer.alloc(4);
    cmdIdBuf.writeUInt32LE(globalCommandId++, 0);

    const body = Buffer.concat([
        Buffer.from([0x03]), imeiBuf,
        Buffer.from([0x04, 0x00, 0x00]),
        Buffer.from([0xE0]), cmdIdBuf,
        Buffer.from([0xE1, textBuf.length]), textBuf
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
    decodeGalileo,
    packGalileoCommand,
    calculateCRC16
};

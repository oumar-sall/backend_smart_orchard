const logger = require('./logger');

const smsService = {
    /**
     * Sends an SMS via the first available GalileoSky controller.
     * @param {string} phone - Recipient phone number
     * @param {string} message - Message content
     * @returns {boolean} - True if a command was queued, false otherwise.
     */
    sendSms(phone, message) {
        // Dynamic import to avoid circular dependencies at startup
        const tcpServer = require('./tcpServer');

        if (!tcpServer.clients || tcpServer.clients.size === 0) {
            logger.warn(`[SMS] ❌ Impossible d'envoyer le SMS vers ${phone} : Aucun boitier connecté au serveur TCP.`);
            return false;
        }

        // Get the first available IMEI
        const firstImei = tcpServer.clients.keys().next().value;
        
        // 1. Normalize phone number for Galileosky (00 prefix required)
        const numericPart = phone.replace(/\D/g, '');
        const formattedPhone = phone.startsWith('+') ? `00${phone.slice(1)}` : (phone.startsWith('00') ? phone : `00${numericPart}`);

        // 2. Sanitize message (no accents or special characters)
        const cleanMsg = message.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Strip accents
            .replace(/[^a-zA-Z0-9\s:,.!]/g, ""); // Keep only letters, digits and basic punctuation

        // 3. Simplified syntax (GPRS): SENDSMS [Phone], [Message]
        // Note: Password removed as the controller often interpreted it as the phone number.
        const cmd = `SENDSMS ${formattedPhone}, ${cleanMsg}`;
        
        logger.info(`[SMS] 📤 Envoi via ${firstImei} : ${cmd}`);
        
        return tcpServer.sendCommand(firstImei, cmd);
    }
};

module.exports = smsService;

const logger = require('./logger');

const smsService = {
    /**
     * Envoie un SMS via le premier boîtier GalileoSky disponible.
     * @param {string} phone - Numéro de téléphone destinataire
     * @param {string} message - Contenu du message
     * @returns {boolean} - True si une commande a été mise en file, false sinon.
     */
    sendSms(phone, message) {
        // Import dynamique pour éviter les dépendances circulaires au démarrage
        const tcpServer = require('./tcpServer');

        if (!tcpServer.clients || tcpServer.clients.size === 0) {
            logger.warn(`[SMS] ❌ Impossible d'envoyer le SMS vers ${phone} : Aucun boitier connecté au serveur TCP.`);
            return false;
        }

        // Récupérer le premier IMEI disponible
        const firstImei = tcpServer.clients.keys().next().value;
        
        // 1. Normalisation du numéro pour Galileosky (préfixe 00 requis)
        const numericPart = phone.replace(/\D/g, '');
        const formattedPhone = phone.startsWith('+') ? `00${phone.slice(1)}` : (phone.startsWith('00') ? phone : `00${numericPart}`);

        // 2. Nettoyage du message (Pas d'accents ni caractères spéciaux)
        const cleanMsg = message.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
            .replace(/[^a-zA-Z0-9\s:,.!]/g, ""); // Ne garde que les 26 lettres, chiffres et ponctuation simple

        // 3. Syntaxe simplifiée (GPRS) : SENDSMS [Phone], [Message]
        // Note: On retire le password car le boîtier l'interprétait souvent comme le numéro de tel.
        const cmd = `SENDSMS ${formattedPhone}, ${cleanMsg}`;
        
        logger.info(`[SMS] 📤 Envoi via ${firstImei} : ${cmd}`);
        
        return tcpServer.sendCommand(firstImei, cmd);
    }
};

module.exports = smsService;

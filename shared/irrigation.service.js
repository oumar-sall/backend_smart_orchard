const { Component, Controller, ActivityLog } = require('../models');
const tcpServer = require('./tcpServer');
const logger = require('./logger');
const { Op } = require('sequelize');

class IrrigationService {
    /**
     * Vérifie toutes les minutes s'il y a des irrigations dont le timer est dépassé.
     * Cette méthode est persistante même après un redémarrage serveur.
     */
    async checkExpiredTimers() {
        try {
            const now = new Date();
            const componentsToClose = await Component.findAll({
                where: {
                    timer_end: {
                        [Op.lt]: now
                    }
                },
                include: [Controller]
            });

            for (const component of componentsToClose) {
                if (component.Controller) {
                    logger.info(`[IrrigationService] Auto-closing expired component: ${component.label} (${component.pin_number})`);
                    
                    // Envoi de la commande de fermeture (le hardware attend souvent "1" pour fermer)
                    tcpServer.sendCommand(component.Controller.imei, `${component.pin_number},1`);
                    
                    // Mise à jour en base
                    await component.update({ timer_end: null });

                    // Log d'activité
                    await ActivityLog.create({
                        controller_id: component.controller_id,
                        event_type: 'IRRIGATION',
                        description: `Fermeture automatique de sécurité (Timer dépassé) : ${component.label}`
                    });
                }
            }
        } catch (error) {
            logger.error('[IrrigationService] Error during expired timers check:', error);
        }
    }

    startMonitoring() {
        logger.info('🚀 Irrigation monitoring service started (checking every minute).');
        // Première vérification immédiate au démarrage
        this.checkExpiredTimers();
        
        // Puis toutes les 60 secondes
        setInterval(() => {
            this.checkExpiredTimers();
        }, 60 * 1000);
    }
}

module.exports = new IrrigationService();

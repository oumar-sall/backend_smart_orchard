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

    /**
     * Vérifie si une lecture d'humidité déclenche l'irrigation automatique.
     * Appelée par tcpServer à chaque nouvelle lecture d'un capteur d'humidité.
     * 
     * Logique : si la valeur est en dessous de min_value (seuil configuré),
     * on ouvre le premier actuateur (type OUT) du même contrôleur.
     */
    async runAutoIrrigationCheck(humidityValue, componentId, imei, controller, sendCommand) {
        try {
            const sensor = await Component.findByPk(componentId);
            if (!sensor || sensor.min_value === null) return; // Pas de seuil configuré

            const threshold = sensor.min_value;
            if (humidityValue >= threshold) return; // Au-dessus du seuil → rien à faire

            // Cooldown : éviter de déclencher toutes les 4 secondes
            const cooldownKey = `auto_irrig_${componentId}`;
            const lastTriggered = this._cooldowns?.[cooldownKey];
            const now = Date.now();
            if (lastTriggered && (now - lastTriggered) < 30 * 60 * 1000) return; // 30 min cooldown
            if (!this._cooldowns) this._cooldowns = {};
            this._cooldowns[cooldownKey] = now;

            // Trouver un actuateur OUT sur le même contrôleur
            const actuator = await Component.findOne({
                where: { controller_id: controller.id, type: 'actuator' }
            });
            if (!actuator) {
                logger.warn(`[AutoIrrig] Aucun actuateur trouvé pour le contrôleur ${controller.id}`);
                return;
            }

            logger.info(`[AutoIrrig] Humidité ${humidityValue}% < seuil ${threshold}% → Ouverture de ${actuator.label}`);
            sendCommand(imei, `${actuator.pin_number},0`);

            await ActivityLog.create({
                controller_id: controller.id,
                event_type: 'IRRIGATION',
                description: `Irrigation automatique déclenchée : ${sensor.label} (${humidityValue}%) sous le seuil (${threshold}%)`
            });
        } catch (error) {
            logger.error('[AutoIrrig] Erreur lors du check automatique:', error);
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

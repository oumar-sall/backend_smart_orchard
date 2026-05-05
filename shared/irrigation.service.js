const { Component, Controller, ActivityLog, Setting } = require('../models');
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
     */
    async runAutoIrrigationCheck(humidityValue, componentId, imei, controller, sendCommand) {
        try {
            // Trouver toutes les vannes configurées en mode auto et liées à ce capteur
            const actuators = await Component.findAll({
                where: { controller_id: controller.id, type: 'actuator' },
                include: [{
                    model: Setting,
                    where: { sensor_id: componentId, auto_mode: true }
                }]
            });

            if (!actuators || actuators.length === 0) return;

            for (const actuator of actuators) {
                const setting = actuator.Setting;
                if (!setting || setting.threshold_min === null) continue;

                if (humidityValue >= setting.threshold_min) {
                    continue; // Humidité satisfaisante
                }

                const now = new Date();
                
                // Si la vanne est déjà ouverte et en cours d'irrigation, on ne renvoie pas la commande 
                // pour éviter de spammer le réseau et la base de données avec des logs doublons.
                if (actuator.timer_end && actuator.timer_end > now) {
                    continue;
                }

                logger.info(`[AutoIrrig] Humidité ${humidityValue}% < seuil ${setting.threshold_min}% → Ouverture de ${actuator.label}`);
                sendCommand(imei, `${actuator.pin_number},0`);

                // Définir la fin du timer si une durée d'irrigation est configurée
                if (setting.irrigation_duration) {
                    const timerEnd = new Date(now.getTime() + setting.irrigation_duration * 1000);
                    await actuator.update({ timer_end: timerEnd });
                }

                await ActivityLog.create({
                    controller_id: controller.id,
                    event_type: 'IRRIGATION',
                    description: `Mode Auto : ${actuator.label} ouverte car l'humidité (${humidityValue}%) est sous le seuil (${setting.threshold_min}%)`
                });
            }
        } catch (error) {
            logger.error('[AutoIrrig] Erreur lors du check automatique:', error);
        }
    }


    /**
     * Appelé quand un boîtier se reconnecte au serveur TCP.
     * Vérifie s'il y a des vannes qui devraient être ouvertes (timer_end > now)
     * et renvoie la commande d'ouverture pour s'assurer que l'état matériel correspond à la base.
     */
    async restoreTimersOnReconnection(imei, sendCommand) {
        try {
            const controller = await Controller.findOne({ where: { imei } });
            if (!controller) return;

            const now = new Date();
            const activeActuators = await Component.findAll({
                where: {
                    controller_id: controller.id,
                    type: 'actuator',
                    timer_end: { [Op.gt]: now }
                }
            });

            for (const actuator of activeActuators) {
                logger.info(`[IrrigationService] Reconnexion de ${imei}: restauration de la vanne ${actuator.label} (ouverte jusqu'à ${actuator.timer_end})`);
                sendCommand(imei, `${actuator.pin_number},0`);
            }
        } catch (error) {
            logger.error('[IrrigationService] Erreur lors de la restauration des timers:', error);
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

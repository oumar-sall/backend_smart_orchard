const { Component, Controller, ActivityLog, Setting } = require('../models');
const logger = require('./logger');
const { Op } = require('sequelize');

class IrrigationService {
    /**
     * Checks every minute if any irrigation timers have expired.
     * This method is persistent across server restarts.
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
                    
                    // Send close command (hardware expects "1" to close)
                    const tcpServer = require('./tcpServer');
                    tcpServer.sendCommand(component.Controller.imei, `${component.pin_number},1`);
                    
                    // Update database
                    await component.update({ timer_end: null });

                    // Log activity
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
     * Checks whether a humidity reading triggers automatic irrigation.
     * Called by tcpServer on every new humidity sensor reading.
     */
    async runAutoIrrigationCheck(humidityValue, componentId, imei, controller, sendCommand) {
        try {
            // Find all actuators configured in auto mode and linked to this sensor
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
                    continue; // Humidity is sufficient
                }

                const now = new Date();
                
                // If the valve is already open and irrigating, skip to avoid
                // spamming the network and database with duplicate logs.
                if (actuator.timer_end && actuator.timer_end > now) {
                    continue;
                }

                logger.info(`[AutoIrrig] Humidité ${humidityValue}% < seuil ${setting.threshold_min}% → Ouverture de ${actuator.label}`);
                sendCommand(imei, `${actuator.pin_number},0`);

                // Set timer end if an irrigation duration is configured
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
     * Called when a controller reconnects to the TCP server.
     * Checks for valves that should be open (timer_end > now)
     * and resends the open command to ensure hardware state matches the database.
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
        // Initial check on startup
        this.checkExpiredTimers();
        
        // Then every 60 seconds
        setInterval(() => {
            this.checkExpiredTimers();
        }, 60 * 1000);
    }
}

module.exports = new IrrigationService();

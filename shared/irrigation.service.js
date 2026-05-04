const { Controller, Component, Reading, ActivityLog, Setting } = require('../models');
const { PINS } = require('./enums');
const logger = require('./logger');

const IrrigationService = {
    /**
     * Checks if humidity is below threshold and triggers irrigation
     */
    async runAutoIrrigationCheck(humValue, humComponentId, imei, controller, sendCommandFn) {
        for (const comp of controller.Components) {
            if (comp.type !== 'actuator' || !comp.Setting) continue;

            const autoMode = comp.Setting.auto_mode;
            const threshold = comp.Setting.threshold_min ?? 35;
            let isAlreadyActive = comp.timer_end && new Date(comp.timer_end) > new Date();
            const isLinkedSensor = !comp.Setting.sensor_id || comp.Setting.sensor_id === humComponentId;

            if (!autoMode || !isLinkedSensor) continue;

            const freshComp = await Component.findByPk(comp.id);
            const freshTimer = freshComp ? freshComp.timer_end : comp.timer_end;
            isAlreadyActive = freshTimer && new Date(freshTimer) > new Date();

            if (isAlreadyActive) continue;

            if (humValue < threshold) {
                logger.info(`[AUTO] 💧 ${humValue}% < ${threshold}% → Opening ${comp.label}`);

                const cmd = `${comp.pin_number},0`; 
                const success = sendCommandFn(imei, cmd);

                if (!success) {
                    logger.warn(`[AUTO] ⚠️ Controller ${imei} offline, command queued but device unreachable.`);
                }

                const duration = comp.Setting.irrigation_duration ?? 300;
                const timerEnd = new Date(Date.now() + duration * 1000);

                await comp.update({ timer_end: timerEnd });
                await ActivityLog.create({
                    controller_id: controller.id,
                    event_type: 'IRRIGATION_AUTO',
                    description: `Démarrage auto : ${comp.label} (Hum : ${humValue}% < Seuil : ${threshold}%)`
                });

                setTimeout(async () => {
                    try {
                        const current = await Component.findByPk(comp.id);
                        if (current && current.timer_end && Math.abs(current.timer_end.getTime() - timerEnd.getTime()) < 1000) {
                            sendCommandFn(imei, `${comp.pin_number},1`); 
                            await current.update({ timer_end: null });
                            await ActivityLog.create({
                                controller_id: controller.id,
                                event_type: 'IRRIGATION_AUTO',
                                description: `Fermeture auto : ${comp.label}`
                            });
                            logger.info(`[AUTO] 🔒 Auto-close for ${comp.label}`);
                        }
                    } catch (err) {
                        logger.error(`[AUTO] Error during auto-close: ${err.message}`);
                    }
                }, duration * 1000);
            }
        }
    },

    /**
     * Restores active timers when a device reconnects
     */
    async restoreTimersOnReconnection(imei, sendCommandFn) {
        try {
            const controller = await Controller.findOne({ 
                where: { imei },
                include: [{ model: Component, where: { type: 'actuator' } }]
            });

            if (!controller || !controller.Components) return;

            const now = new Date();
            let restoredCount = 0;

            for (const comp of controller.Components) {
                if (comp.timer_end && new Date(comp.timer_end) > now) {
                    const remainingSeconds = Math.round((new Date(comp.timer_end).getTime() - now.getTime()) / 1000);
                    
                    logger.info(`[RESTAURATION] ♻️ Reprise de l'irrigation pour ${comp.label} (${remainingSeconds}s restantes)`);
                    
                    sendCommandFn(imei, `${comp.pin_number},0`);

                    setTimeout(async () => {
                        try {
                            const fresh = await Component.findByPk(comp.id);
                            if (fresh && fresh.timer_end && Math.abs(fresh.timer_end.getTime() - new Date(comp.timer_end).getTime()) < 1000) {
                                sendCommandFn(imei, `${comp.pin_number},1`);
                                await fresh.update({ timer_end: null });
                                await ActivityLog.create({
                                    controller_id: controller.id,
                                    event_type: 'IRRIGATION_AUTO',
                                    description: `Fermeture auto (après restauration) : ${comp.label}`
                                });
                            }
                        } catch (e) {
                            logger.error(`[RESTAURATION] Erreur lors de la fermeture après reprise : ${e.message}`);
                        }
                    }, remainingSeconds * 1000);

                    restoredCount++;
                }
            }

            if (restoredCount > 0) {
                await ActivityLog.create({
                    controller_id: controller.id,
                    event_type: 'SECURITY_INFO',
                    description: `RESTAURATION : Connexion rétablie. ${restoredCount} vanne(s) réouverte(s) pour terminer l'irrigation.`
                });
            }
        } catch (err) {
            logger.error(`[RESTAURATION] Erreur lors de la restauration des minuteurs pour IMEI ${imei} : ${err.message}`);
        }
    },

    /**
     * Restores timers globally on server startup
     */
    async restoreTimersOnStartup(sendCommandFn) {
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
                                const fresh = await Component.findByPk(comp.id);
                                if (fresh && fresh.timer_end && Math.abs(fresh.timer_end.getTime() - timerVal) < 1000) {
                                    sendCommandFn(comp.Controller.imei, `${comp.pin_number},1`);
                                    await fresh.update({ timer_end: null });
                                    logger.info(`[AUTO] 🔒 Fermeture auto (restauration au démarrage) pour ${comp.label}`);
                                }
                            } catch (e) {
                                logger.error(`[TCP] Erreur restauration minuteur : ${e.message}`);
                            }
                        }, remainingMs);
                        restoredCount++;
                    } else {
                        logger.info(`[TCP] ⚠️ Expired timer detected for ${comp.label}. Forcing close command.`);
                        if(comp.Controller) {
                            sendCommandFn(comp.Controller.imei, `${comp.pin_number},1`);
                        }
                        await comp.update({ timer_end: null });
                    }
                }
            }
            if (restoredCount > 0) {
                logger.info(`[RESTAURATION] ⏳ ${restoredCount} minuteurs d'irrigation récupérés en mémoire !`);
            }
        } catch (err) {
            logger.error(`[RESTAURATION] Erreur lors de la reprise globale au démarrage : ${err.message}`);
        }
    }
};

module.exports = IrrigationService;

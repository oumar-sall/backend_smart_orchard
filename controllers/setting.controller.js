const { Setting, Component, Controller, ActivityLog } = require('../models');
const { sendCommand } = require('../shared/tcpServer');

const SettingController = {
    async getSettings(req, res, next) {
        try {
            const { pin, controller_id } = req.query;
            if (!pin) return res.status(400).json({ error: 'Paramètre pin requis' });

            const componentWhere = { pin_number: pin };
            if (controller_id) componentWhere.controller_id = controller_id;

            const settings = await Setting.findOne({
                include: [{
                    model: Component,
                    where: componentWhere,
                    include: [Controller]
                }]
            });

            if (settings && settings.Component && settings.Component.Controller) {
                // On injecte l'intervalle global du contrôleur dans le retour JSON
                settings.dataValues.reporting_interval = settings.Component.Controller.reporting_interval;
            }

            res.json(settings);
        } catch (err) {
            next(err);
        }
    },

    async updateSettings(req, res, next) {
        try {
            const { irrigation_duration, reporting_interval, threshold_min, sensor_id, auto_mode, pin, controller_id } = req.body;
            if (!pin) return res.status(400).json({ error: 'Paramètre pin requis' });
            
            const componentWhere = { pin_number: pin };
            if (controller_id) componentWhere.controller_id = controller_id;

            const settings = await Setting.findOne({
                include: [{
                    model: Component,
                    where: componentWhere,
                    include: [{ model: Controller }]
                }]
            });

            if (settings) {
                const oldInterval = settings.Component?.Controller?.reporting_interval;
                
                await settings.update({
                    irrigation_duration: irrigation_duration !== undefined ? irrigation_duration : settings.irrigation_duration,
                    threshold_min: threshold_min !== undefined ? threshold_min : settings.threshold_min,
                    sensor_id: sensor_id !== undefined ? sensor_id : settings.sensor_id,
                    auto_mode: auto_mode !== undefined ? auto_mode : settings.auto_mode,
                });

                // Audit Log
                await ActivityLog.create({
                    controller_id: settings.Component.controller_id,
                    user_id: req.user.id,
                    event_type: 'SETTINGS_UPDATE',
                    description: `Réglages mis à jour pour : ${settings.Component.label}`
                });

                // Si l'intervalle a changé (Global), on met à jour le Controller
                if (reporting_interval !== undefined && reporting_interval !== oldInterval) {
                    const controller = settings.Component?.Controller;
                    if (controller) {
                        await controller.update({ reporting_interval });
                        if (controller.imei) {
                            sendCommand(controller.imei, `HEAD ${reporting_interval}`);
                        }
                    }
                }

                res.json(settings);
            } else {
                res.status(404).json({ error: `Settings for pin ${pin} not found` });
            }
        } catch (err) {
            next(err);
        }
    }
};

module.exports = SettingController;

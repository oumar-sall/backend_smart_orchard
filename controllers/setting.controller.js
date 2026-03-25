const { Setting, Component, Controller } = require('../models');
const { sendCommand } = require('../shared/tcpServer');

const SettingController = {
    async getSettings(req, res, next) {
        try {
            const { pin } = req.query;
            if (!pin) return res.status(400).json({ error: 'Paramètre pin requis' });

            const settings = await Setting.findOne({
                include: [{
                    model: Component,
                    where: { pin_number: pin }
                }]
            });
            res.json(settings);
        } catch (err) {
            next(err);
        }
    },

    async updateSettings(req, res, next) {
        try {
            const { irrigation_duration, reporting_interval, threshold_min, sensor_id, auto_mode, pin } = req.body;
            if (!pin) return res.status(400).json({ error: 'Paramètre pin requis' });
            const targetPin = pin;

            const settings = await Setting.findOne({
                include: [{
                    model: Component,
                    where: { pin_number: targetPin },
                    include: [{ model: Controller }]
                }]
            });

            if (settings) {
                const oldInterval = settings.reporting_interval;
                await settings.update({
                    irrigation_duration: irrigation_duration !== undefined ? irrigation_duration : settings.irrigation_duration,
                    reporting_interval: reporting_interval !== undefined ? reporting_interval : settings.reporting_interval,
                    threshold_min: threshold_min !== undefined ? threshold_min : settings.threshold_min,
                    sensor_id: sensor_id !== undefined ? sensor_id : settings.sensor_id,
                    auto_mode: auto_mode !== undefined ? auto_mode : settings.auto_mode,
                });



                // Si l'intervalle a changé, on envoie la commande au boîtier
                if (reporting_interval && reporting_interval !== oldInterval) {
                    const controller = settings.Component?.Controller;
                    if (controller && controller.imei) {
                        sendCommand(controller.imei, `HEAD ${reporting_interval}`);
                    }
                }

                res.json(settings);
            } else {
                res.status(404).json({ error: `Settings for pin ${targetPin} not found` });
            }
        } catch (err) {
            next(err);
        }
    }
};

module.exports = SettingController;

const { Setting, Component, Controller } = require('../models');
const { sendCommand } = require('../shared/tcpServer');

const SettingController = {
    async getSettings(req, res, next) {
        try {
            const { pin } = req.query;
            const targetPin = pin; // Fallback par défaut

            const settings = await Setting.findOne({
                include: [{
                    model: Component,
                    where: { pin_number: targetPin }
                }]
            });
            res.json(settings);
        } catch (err) {
            next(err);
        }
    },

    async updateSettings(req, res, next) {
        try {
            const { irrigation_duration, reporting_interval, pin } = req.body;
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
                    reporting_interval: reporting_interval !== undefined ? reporting_interval : settings.reporting_interval
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

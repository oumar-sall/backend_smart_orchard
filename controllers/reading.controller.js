const { Reading, Component } = require('../models');

const ReadingController = {
    async getLatestDashboard(req, res, next) {
        try {
            // Find the most recent reading for each component and map it
            const latestReadings = await Reading.findAll({
                include: [{
                    model: Component,
                    attributes: ['type', 'pin_number', 'label']
                }],
                order: [['created_at', 'DESC']],
                limit: 50 // We just pull the recent ones to extract the latest distinctive metrics
            });

            // Extract the latest temperature, humidity and PH
            let temperature = null;
            let humidity = null;
            let ph = null;

            for (const reading of latestReadings) {
                if (reading.Component) {
                    const pin = reading.Component.pin_number;
                    // Temp: tag FE → 'temp', ou tag modbus direct → 'modbus0'
                    if (temperature === null && (pin === 'temp' || pin === 'modbus0')) {
                        temperature = reading.value;
                    }
                    // Humidité: tag FE → 'hum', ou tag modbus direct → 'modbus1'
                    if (humidity === null && (pin === 'hum' || pin === 'modbus1')) {
                        humidity = reading.value;
                    }
                    // PH: pin 'ph'
                    if (ph === null && pin === 'ph') {
                        ph = reading.value;
                    }
                }
                if (temperature !== null && humidity !== null && ph !== null) break;
            }

            res.json({
                temperature: temperature || '--',
                humidity: humidity || '--',
                ph: ph || '--'
            });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ReadingController;

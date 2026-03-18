const { Reading, Component, ActivityLog, sequelize } = require('../models');
const { Op } = require('sequelize');

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
    },

    async getHistory(req, res, next) {
        try {
            const { period } = req.query;
            const daysToFetch = period === 'month' ? 30 : 7;
            
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysToFetch);
            startDate.setHours(0, 0, 0, 0);

            // 1. Fetch readings
            const readings = await Reading.findAll({
                where: {
                    created_at: { [Op.gte]: startDate }
                },
                include: [{
                    model: Component,
                    attributes: ['pin_number']
                }],
                order: [['created_at', 'ASC']]
            });

            // 2. Fetch irrigation logs
            const activityLogs = await ActivityLog.findAll({
                where: {
                    event_type: 'IRRIGATION',
                    timestamp: { [Op.gte]: startDate }
                }
            });

            // 3. Process data per day
            const historyMap = {};

            // Initialize last 7 days
            for (let i = 0; i < daysToFetch; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                historyMap[dateStr] = {
                    date: dateStr,
                    displayDate: date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                    tempValues: [],
                    humValues: [],
                    phValues: [],
                    wateringCount: 0
                };
            }

            // Group readings
            readings.forEach(r => {
                const dateStr = new Date(r.created_at).toISOString().split('T')[0];
                if (historyMap[dateStr]) {
                    const pin = r.Component?.pin_number;
                    if (pin === 'temp' || pin === 'modbus0') historyMap[dateStr].tempValues.push(r.value);
                    if (pin === 'hum' || pin === 'modbus1') historyMap[dateStr].humValues.push(r.value);
                    if (pin === 'ph') historyMap[dateStr].phValues.push(r.value);
                }
            });

            // Group irrigation logs
            activityLogs.forEach(log => {
                const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
                if (historyMap[dateStr]) {
                    historyMap[dateStr].wateringCount++;
                }
            });

            // 4. Calculate averages and format response
            const response = Object.values(historyMap).map((day, index, array) => {
                const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : '--';
                
                const currentAvgHum = avg(day.humValues);
                let trend = 'stable';
                
                // Simple trend calculation compared to "next" day in array (which is actually the previous day chronologically)
                if (index < array.length - 1) {
                    const prevDay = array[index + 1];
                    const prevAvgHum = avg(prevDay.humValues);
                    if (currentAvgHum !== '--' && prevAvgHum !== '--') {
                        if (currentAvgHum > prevAvgHum) trend = 'up';
                        else if (currentAvgHum < prevAvgHum) trend = 'down';
                    }
                }

                return {
                    date: day.date,
                    displayDate: day.displayDate,
                    avgTemperature: avg(day.tempValues),
                    avgHumidity: currentAvgHum,
                    avgPh: day.phValues.length ? (day.phValues.reduce((a, b) => a + b, 0) / day.phValues.length).toFixed(1) : '--',
                    wateringCount: day.wateringCount,
                    humidityTrend: trend
                };
            }).sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json(response);
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ReadingController;

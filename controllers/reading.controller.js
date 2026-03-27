const { Reading, Component, ActivityLog, Controller, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { PINS } = require('../shared/enums');

const ReadingController = {
    async getLatestDashboard(req, res, next) {
        try {
            const { controller_id } = req.query;
            const componentWhere = controller_id ? { controller_id } : {};

            // Find the most recent reading for each component and map it
            const latestReadings = await Reading.findAll({
                include: [{
                    model: Component,
                    attributes: ['type', 'pin_number', 'label', 'unit', 'min_value', 'max_value'],
                    where: componentWhere
                }],
                order: [['created_at', 'DESC']],
                limit: 50 // We just pull the recent ones to extract the latest distinctive metrics
            });

            const sensorsMap = {};

            for (const reading of latestReadings) {
                if (reading.Component && reading.Component.type === 'sensor') {
                    const pin = reading.Component.pin_number;
                    if (!sensorsMap[pin]) {
                        sensorsMap[pin] = {
                            id: pin,
                            title: reading.Component.label,
                            value: reading.value,
                            unit: reading.Component.unit || '',
                            min: reading.Component.min_value ?? 0,
                            max: reading.Component.max_value ?? 100,
                        };
                    }
                }
            }
            
            const sensorsList = Object.values(sensorsMap);

            // Fetch ALL actuators and their irrigation status for THIS controller
            const allActuators = await Component.findAll({
                where: { 
                    type: 'actuator',
                    ...componentWhere
                },
                attributes: ['id', 'label', 'pin_number', 'timer_end']
            });

            const irrigationStatuses = allActuators.map(act => ({
                id: act.id,
                label: act.label,
                pin: act.pin_number,
                active: act.timer_end ? new Date(act.timer_end) > new Date() : false,
                timerEnd: act.timer_end
            }));

            res.json({
                sensors: sensorsList,
                actuators: irrigationStatuses
            });
        } catch (err) {
            next(err);
        }
    },

    async getHistory(req, res, next) {
        try {
            const { period, controller_id } = req.query;
            const daysToFetch = period === 'month' ? 30 : 7;
            const componentWhere = controller_id ? { controller_id } : {};

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysToFetch);
            startDate.setHours(0, 0, 0, 0);

            // 1. Fetch readings for component of this controller
            const readings = await Reading.findAll({
                where: {
                    created_at: { [Op.gte]: startDate }
                },
                include: [{
                    model: Component,
                    attributes: ['pin_number'],
                    where: componentWhere
                }],
                order: [['created_at', 'ASC']]
            });

            // 2. Fetch irrigation logs for this controller
            const logWhere = {
                event_type: 'IRRIGATION',
                timestamp: { [Op.gte]: startDate }
            };
            if (controller_id) logWhere.controller_id = controller_id;

            const activityLogs = await ActivityLog.findAll({
                where: logWhere
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
                    if (pin === PINS.TEMP) historyMap[dateStr].tempValues.push(r.value);
                    if (pin === PINS.HUM) historyMap[dateStr].humValues.push(r.value);
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
    },

    async toggleIrrigation(req, res, next) {
        try {
            const { action, componentId } = req.body;

            // On récupère le composant pour connaître son pin_number
            const component = await Component.findByPk(componentId, { include: [Setting] });
            if (!component) {
                console.error(`[Controller] Composant ID ${componentId} non trouvé`);
                return res.status(404).json({ error: "Composant non trouvé" });
            }

            // Construction générique de la commande: PIN + "," + COMMANDE
            const actionValue = action === 'open' ? '0' : '1';
            const command = `${component.pin_number},${actionValue}`;

            // On récupère le contrôleur principal (pour l'IMEI)
            const controller = await Controller.findOne({ where: { id: component.controller_id } });
            if (!controller) {
                console.error("[Controller] Aucun contrôleur trouvé pour ce composant");
                return res.status(404).json({ error: "Contrôleur non trouvé" });
            }

            const tcpServer = require('../shared/tcpServer');
            const success = tcpServer.sendCommand(controller.imei, command);

            if (success) {
                let timerEnd = null;
                
                if (action === 'open') {
                    const irrigation_duration = (component.Setting && component.Setting.irrigation_duration) ? component.Setting.irrigation_duration : 300;
                    timerEnd = new Date(Date.now() + irrigation_duration * 1000);
                    
                    await component.update({ timer_end: timerEnd });

                    // Programmation de la fermeture automatique
                    setTimeout(async () => {
                        try {
                            const freshComp = await Component.findByPk(component.id);
                            if (freshComp && freshComp.timer_end && Math.abs(freshComp.timer_end.getTime() - timerEnd.getTime()) < 1000) {
                                    tcpServer.sendCommand(controller.imei, `${component.pin_number},1`);
                                await freshComp.update({ timer_end: null });
                                await ActivityLog.create({
                                    controller_id: controller.id,
                                    event_type: 'IRRIGATION',
                                    description: `Fermeture automatique : ${component.label}`
                                });
                            }
                        } catch (e) {
                            console.error("[Timer] Erreur fermeture auto:", e);
                        }
                    }, irrigation_duration * 1000);
                } else {
                    await component.update({ timer_end: null });
                }

                await ActivityLog.create({
                    controller_id: controller.id,
                    event_type: 'IRRIGATION',
                    description: `${action === 'open' ? 'Ouverture' : 'Fermeture'} manuelle de : ${component.label}`
                });

                return res.json({ 
                    success: true, 
                    message: `Commande ${command} envoyée`,
                    timerEnd: timerEnd
                });
            } else {
                console.error("[Controller]sendCommand a échoué (boîtier déconnecté?)");
                return res.status(503).json({ error: "Boîtier hors ligne" });
            }
        } catch (err) {
            console.error("[Controller] ERREUR FATALE dans toggleIrrigation:", err);
            return res.status(500).json({ error: "Internal Server Error", details: err.message });
        }
    },

    async getControllerStatus(req, res, next) {
        try {
            const { controller_id } = req.query;
            const where = controller_id ? { id: controller_id } : { order: [['id', 'ASC']] };
            
            const controller = await Controller.findOne({ where: controller_id ? { id: controller_id } : {}, order: controller_id ? [] : [['id', 'ASC']] });
            if (!controller) return res.json({ online: false });

            const tcpServer = require('../shared/tcpServer');
            const isOnline = tcpServer.clients.has(controller.imei);

            res.json({ online: isOnline, controllerName: controller.name });
        } catch (err) {
            next(err);
        }
    },

    async getActuators(req, res, next) {
        try {
            const { controller_id } = req.query;
            const actuators = await Component.findAll({
                where: { 
                    type: 'actuator',
                    ...(controller_id && { controller_id })
                },
                attributes: ['id', 'label', 'pin_number'],
                order: [['pin_number', 'ASC']]
            });
            res.json(actuators);
        } catch (err) {
            next(err);
        }
    },

    async getSensors(req, res, next) {
        try {
            const { controller_id } = req.query;
            const sensors = await Component.findAll({
                where: { 
                    type: 'sensor',
                    ...(controller_id && { controller_id })
                },
                attributes: ['id', 'label', 'pin_number'],
                order: [['label', 'ASC']]
            });
            res.json(sensors);
        } catch (err) {
            next(err);
        }
    },

    async createComponent(req, res, next) {
        try {
            const { type, pin_number, label, unit, min_value, max_value, controller_id } = req.body;
            if (!['sensor', 'actuator'].includes(type) || !pin_number || !label) {
                return res.status(400).json({ error: 'Données invalides (type, pin_number, label requis)' });
            }

            let targetControllerId = controller_id;
            if (!targetControllerId) {
                const controller = await Controller.findOne({ order: [['id', 'ASC']] });
                if (!controller) {
                    return res.status(404).json({ error: 'Aucun contrôleur n\'a été trouvé dans la base' });
                }
                targetControllerId = controller.id;
            }

            const newComponent = await Component.create({
                controller_id: targetControllerId,
                type,
                pin_number,
                label,
                unit,
                min_value,
                max_value
            });

            // Si c'est un actionneur, créer des paramètres par défaut
            if (type === 'actuator') {
                await Setting.create({ component_id: newComponent.id });
            }

            res.json(newComponent);
        } catch (err) {
            console.error('[Controller] Error creating component:', err);
            next(err);
        }
    },

    async deleteComponent(req, res, next) {
        try {
            const { id } = req.params;
            const component = await Component.findByPk(id);
            if (!component) {
                return res.status(404).json({ error: 'Composant introuvable' });
            }

            await component.destroy();
            res.json({ success: true, message: 'Composant supprimé avec succès' });
        } catch (err) {
            console.error('[Controller] Error deleting component:', err);
            next(err);
        }
    },

    /**
     * POST /readings/simulate
     * Body: { humidity: number, pin?: string }
     * Simule une lecture capteur pour tester la logique d'arrosage automatique.
     */
    async simulateHumidity(req, res, next) {
        try {
            const { humidity, pin, controller_id } = req.body;
            if (humidity === undefined || isNaN(humidity)) {
                return res.status(400).json({ error: 'Champ "humidity" (number) requis' });
            }

            // Récupère le contrôleur spécifié ou le premier
            const controller = await Controller.findOne({
                where: controller_id ? { id: controller_id } : {},
                order: controller_id ? [] : [['id', 'ASC']],
                include: [{
                    model: Component,
                    include: [Setting]
                }]
            });
            if (!controller) return res.status(404).json({ error: 'Aucun contrôleur trouvé' });

            // Trouve le composant humidité (par defaut PINS.HUM)
            const targetPin = pin || PINS.HUM;
            const humComp = controller.Components.find(c => c.pin_number === targetPin);
            if (!humComp) {
                return res.status(404).json({ error: `Composant '${targetPin}' introuvable` });
            }

            console.log(`[SIMULATE] 🧪 Injection humidité simulée: ${humidity}% sur capteur '${targetPin}'`);

            const tcpServer = require('../shared/tcpServer');
            await tcpServer.runAutoIrrigationCheck(humidity, humComp.id, controller.imei, controller);

            res.json({
                ok: true,
                message: `Simulation exécutée: hum=${humidity}% sur capteur '${targetPin}'`,
                controller: controller.name,
                imei: controller.imei,
            });
        } catch (err) {
            next(err);
        }
    }
};


module.exports = ReadingController;

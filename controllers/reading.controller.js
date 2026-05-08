const { Reading, Component, ActivityLog, Controller, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { PINS } = require('../shared/enums');
const logger = require('../shared/logger');

const ReadingController = {
    async getLatestDashboard(req, res, next) {
        try {
            const { controller_id } = req.query;
            const componentWhere = controller_id ? { controller_id } : {};

            // Fetch all sensors for this controller
            const sensors = await Component.findAll({
                where: { 
                    type: 'sensor',
                    ...componentWhere
                },
                attributes: ['id', 'label', 'pin_number', 'unit', 'min_value', 'max_value', 'v_min', 'v_max']
            });
            
            const sensorsList = [];

            for (const sensor of sensors) {
                // Find the absolute latest reading for this specific component
                const latestReading = await Reading.findOne({
                    where: { component_id: sensor.id },
                    order: [['created_at', 'DESC']]
                });

                sensorsList.push({
                    id: sensor.id,
                    title: sensor.label,
                    value: latestReading ? latestReading.value : '--',
                    unit: sensor.unit || '',
                    min: sensor.min_value ?? 0,
                    max: sensor.max_value ?? 100,
                });
            }

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
                logger.error(`[Reading] Component ID ${componentId} not found`);
                return res.status(404).json({ error: "Composant non trouvé" });
            }

            // Construction générique de la commande: PIN + "," + COMMANDE
            const actionValue = action === 'open' ? '0' : '1';
            const command = `${component.pin_number},${actionValue}`;

            const controller = await Controller.findOne({ where: { id: component.controller_id } });
            if (!controller) {
                logger.error('[Reading] No controller found for this component');
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
                            logger.error('[Reading] Auto-close timer error:', e);
                        }
                    }, irrigation_duration * 1000);
                } else {
                    await component.update({ timer_end: null });
                }

                await ActivityLog.create({
                    controller_id: controller.id,
                    user_id: req.user.id,
                    event_type: 'IRRIGATION',
                    description: `${action === 'open' ? 'Ouverture' : 'Fermeture'} manuelle de : ${component.label}`
                });

                return res.json({ 
                    success: true, 
                    message: `Commande ${command} envoyée`,
                    timerEnd: timerEnd
                });
            } else {
                logger.error('[Reading] sendCommand failed — device may be offline');
                return res.status(503).json({ error: "Boîtier hors ligne" });
            }
        } catch (err) {
            logger.error('[Reading] Fatal error in toggleIrrigation:', err);
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

            res.json({ 
                online: isOnline, 
                controllerName: controller.name, 
                reporting_interval: controller.reporting_interval 
            });
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
                attributes: ['id', 'label', 'pin_number', 'timer_end'],
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
                attributes: ['id', 'label', 'pin_number', 'unit', 'min_value', 'max_value', 'v_min', 'v_max'],
                order: [['label', 'ASC']]
            });
            res.json(sensors);
        } catch (err) {
            next(err);
        }
    },

    async createComponent(req, res, next) {
        try {
            const { type, pin_number, label, unit, min_value, max_value, v_min, v_max, controller_id, modbus_tag } = req.body;
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

            // Vérifier si le PIN + Tag est déjà utilisé sur ce contrôleur
            const existing = await Component.findOne({
                where: {
                    controller_id: targetControllerId,
                    pin_number,
                    modbus_tag: modbus_tag || null
                }
            });

            if (existing) {
                return res.status(400).json({ error: `Le Pin ${pin_number} (Tag ${modbus_tag || 'Standard'}) est déjà utilisé par "${existing.label}"` });
            }

            const newComponent = await Component.create({
                controller_id: targetControllerId,
                type,
                pin_number,
                label,
                unit,
                min_value,
                max_value,
                v_min: v_min !== undefined ? v_min : 0.0,
                v_max: v_max !== undefined ? v_max : 10.0,
                modbus_tag: modbus_tag || null
            });

            if (type === 'actuator') {
                await Setting.create({ component_id: newComponent.id });
            }

            res.json(newComponent);
        } catch (err) {
            logger.error('[Reading] Error creating component:', err);
            next(err);
        }
    },

    async updateComponent(req, res, next) {
        try {
            const { id } = req.params;
            const { pin_number, label, unit, min_value, max_value, v_min, v_max, modbus_tag } = req.body;

            const component = await Component.findByPk(id);
            if (!component) {
                return res.status(404).json({ error: 'Composant introuvable' });
            }

            // Si le PIN ou le Tag change, vérifier qu'il est libre
            const newPin = pin_number || component.pin_number;
            const newTag = modbus_tag !== undefined ? modbus_tag : component.modbus_tag;

            if (newPin !== component.pin_number || newTag !== component.modbus_tag) {
                const existing = await Component.findOne({
                    where: {
                        controller_id: component.controller_id,
                        pin_number: newPin,
                        modbus_tag: newTag || null,
                        id: { [Op.ne]: id } // On ignore le composant actuel
                    }
                });

                if (existing) {
                    return res.status(400).json({ error: `Le Pin ${newPin} (Tag ${newTag || 'Standard'}) est déjà utilisé par "${existing.label}"` });
                }
            }

            await component.update({
                pin_number: pin_number || component.pin_number,
                label: label || component.label,
                unit: unit !== undefined ? unit : component.unit,
                min_value: min_value !== undefined ? min_value : component.min_value,
                max_value: max_value !== undefined ? max_value : component.max_value,
                v_min: v_min !== undefined ? v_min : component.v_min,
                v_max: v_max !== undefined ? v_max : component.v_max,
                modbus_tag: modbus_tag !== undefined ? modbus_tag : component.modbus_tag
            });

            res.json({ success: true, message: 'Composant mis à jour avec succès', component });
        } catch (err) {
            logger.error('[Reading] Error updating component:', err);
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

            // Disable FK constraints for SQLite during deletion
            await sequelize.query('PRAGMA foreign_keys = OFF');

            try {
                await Setting.update({ sensor_id: null }, { where: { sensor_id: id } });
                await Reading.destroy({ where: { component_id: id } });
                await Setting.destroy({ where: { component_id: id } });
                await component.destroy();

                res.json({ success: true, message: 'Composant supprimé avec succès' });
            } finally {
                await sequelize.query('PRAGMA foreign_keys = ON');
            }
        } catch (err) {
            logger.error('[Reading] Error deleting component:', err);
            res.status(500).json({ error: 'Erreur lors de la suppression', details: err.message });
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


            const IrrigationService = require('../shared/irrigation.service');
            const tcpServer = require('../shared/tcpServer');
            await IrrigationService.runAutoIrrigationCheck(humidity, humComp.id, controller.imei, controller, tcpServer.sendCommand);

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

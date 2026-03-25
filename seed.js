const {
    Controller,
    Component,
    Reading,
    Setting,
    ActivityLog,
} = require('./models');

async function seed() {
    // ── CONTRÔLEUR (GALILEOSKY) ───────────────────────────────────
    const [ctrlReal] = await Controller.findOrCreate({
        where: { imei: '865513072734987' },
        defaults: {
            id: '57292f5e-01b3-4e44-8390-dbc319efd96b',
            name: 'Galileosky Verger Test',
        }
    });

    console.log(`✅ Contrôleur réel prêt : ${ctrlReal.name}`);

    // ── COMPOSANTS RS485 (MODBUS) ────────────────────────────────
    const [sensorTempRS485] = await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'modbus0' },
        defaults: { type: 'sensor', label: 'Température Air (RS485)' }
    });

    const [sensorHumiditeRS485] = await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'modbus1' },
        defaults: { type: 'sensor', label: 'Humidité Sol (RS485)' }
    });

    await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'temp' },
        defaults: { type: 'sensor', label: 'Température Sol (RS485 - Tag FE)' }
    });

    await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'hum' },
        defaults: { type: 'sensor', label: 'Humidité Air (RS485 - Tag FE)' }
    });

    // ── AUTRES COMPOSANTS ────────────────────────────────────────
    await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'VBAT' },
        defaults: { type: 'sensor', label: 'Batterie interne' }
    });

    const [valveSecteur1] = await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'OUT 0' },
        defaults: { type: 'actuator', label: 'Vanne Secteur 1 (CR202)' }
    });

    const [valveSecteur2] = await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'OUT 1' },
        defaults: { type: 'actuator', label: 'Vanne Secteur 2 (CR202)' }
    });

    const [valveSecteur3] = await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'OUT 2' },
        defaults: { type: 'actuator', label: 'Vanne Secteur 3 (CR202)' }
    });

    await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'GPS_LAT' },
        defaults: { type: 'sensor', label: 'Latitude' }
    });

    await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'GPS_LON' },
        defaults: { type: 'sensor', label: 'Longitude' }
    });

    const [sensorPH] = await Component.findOrCreate({
        where: { controller_id: ctrlReal.id, pin_number: 'ph' },
        defaults: { type: 'sensor', label: 'Capteur PH Sol' }
    });

    // ── Lectures initiales (seulement si la table est vide) ─────
    const countReadings = await Reading.count();
    if (countReadings === 0) {
        console.log('📊 Génération de 60 jours de données simulées...');
        const readingsToCreate = [];
        const logsToCreate = [];

        for (let i = 0; i < 60; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const temp = 25 + Math.random() * 15;
            const hum = 40 + Math.random() * 50;
            const ph = 6.0 + Math.random() * 1.5;

            readingsToCreate.push({ component_id: sensorTempRS485.id, value: parseFloat(temp.toFixed(1)), created_at: date });
            readingsToCreate.push({ component_id: sensorHumiditeRS485.id, value: parseFloat(hum.toFixed(1)), created_at: date });
            readingsToCreate.push({ component_id: sensorPH.id, value: parseFloat(ph.toFixed(1)), created_at: date });

            const wateringCount = Math.floor(Math.random() * 5);
            for (let w = 0; w < wateringCount; w++) {
                const logDate = new Date(date);
                logDate.setHours(8 + w * 3, 0, 0, 0);
                logsToCreate.push({
                    controller_id: ctrlReal.id,
                    event_type: 'IRRIGATION',
                    description: `Arrosage automatique #${w + 1}`,
                    timestamp: logDate
                });
            }
        }
        await Reading.bulkCreate(readingsToCreate);
        await ActivityLog.bulkCreate(logsToCreate);
    }

    // ── Paramètres par défaut (Idempotent) ───────────────────────
    for (const valve of [valveSecteur1, valveSecteur2, valveSecteur3]) {
        await Setting.findOrCreate({
            where: { component_id: valve.id },
            defaults: {
                auto_mode: true,
                threshold_min: 35.0,
                irrigation_duration: 600,
                reporting_interval: 30,
                sensor_id: sensorHumiditeRS485.id,
            }
        });
    }

    console.log('\n🌱 Base de données prête !');
}

module.exports = seed;

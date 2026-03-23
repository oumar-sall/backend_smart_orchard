const {
    sequelize,
    User,
    Controller,
    Component,
    Reading,
    Setting,
    Access,
    ActivityLog,
} = require('./models');

async function seed() {
    console.log('🔄 Synchronisation de la base de données (FORCE: TRUE)...');
    await sequelize.sync({ force: true });

    // ── Utilisateurs ─────────────────────────────────────────────
    const lamine = await User.create({
        email: 'lamine@agrotech.com',
        password: 'password123',
        phone: '+22300000000',
        first_name: 'Lamine',
        last_name: 'Sacko',
    });

    // ── TON VRAI CONTRÔLEUR (GALILEOSKY) ──────────────────────────
    const ctrlReal = await Controller.create({
        id: '57292f5e-01b3-4e44-8390-dbc319efd96b',
        imei: '865513072734987',
        name: 'Galileosky Verger Test',
    });

    console.log(`✅ Contrôleur réel créé : ${ctrlReal.name}`);

    // ── COMPOSANTS RS485 (MODBUS) ────────────────────────────────
    // modbus0 correspond au tag 0x90 (Temperature ds tcpServer.js)
    const sensorTempRS485 = await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'modbus0',
        label: 'Température Air (RS485)',
    });

    // modbus1 correspond au tag 0x91 (Humidité ds tcpServer.js)
    const sensorHumiditeRS485 = await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'modbus1',
        label: 'Humidité Sol (RS485)',
    });

    // capteur de temp via Tag FE
    const sensorTempFE = await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'temp',
        label: 'Température Sol (RS485 - Tag FE)',
    });

    // capteur humidité via Tag FE
    const sensorHumFE = await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'hum',
        label: 'Humidité Air (RS485 - Tag FE)',
    });

    // ── AUTRES COMPOSANTS ────────────────────────────────────────
    const sensorBattery = await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'VBAT',
        label: 'Batterie interne',
    });

    const pumpVerger = await Component.create({
        controller_id: ctrlReal.id,
        type: 'actuator',
        pin_number: 'OUT0',
        label: 'Pompe principale',
    });

    const valveSecteur = await Component.create({
        controller_id: ctrlReal.id,
        type: 'actuator',
        pin_number: 'OUT1',
        label: 'Vanne Secteur (CR202)',
    });

    // GPS (Labels obligatoires pour ton code TCP actuel)
    await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'GPS_LAT',
        label: 'Latitude',
    });
    await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'GPS_LON',
        label: 'Longitude',
    });

    const sensorPH = await Component.create({
        controller_id: ctrlReal.id,
        type: 'sensor',
        pin_number: 'ph',
        label: 'Capteur PH Sol',
    });

    // ── Lectures Initiales (60 jours d'historique) ───────────────────
    console.log('📊 Génération de 60 jours de données simulées...');
    const readingsToCreate = [];
    const logsToCreate = [];

    for (let i = 0; i < 60; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        // Simuler des variations légères
        const temp = 25 + Math.random() * 15; // 25-40°C
        const hum = 40 + Math.random() * 50;  // 40-90%
        const ph = 6.0 + Math.random() * 1.5; // 6.0-7.5

        readingsToCreate.push({ component_id: sensorTempRS485.id, value: parseFloat(temp.toFixed(1)), created_at: date });
        readingsToCreate.push({ component_id: sensorHumiditeRS485.id, value: parseFloat(hum.toFixed(1)), created_at: date });
        readingsToCreate.push({ component_id: sensorPH.id, value: parseFloat(ph.toFixed(1)), created_at: date });

        // Ajouter des arrosages aléatoires (0 à 4 par jour)
        const wateringCount = Math.floor(Math.random() * 5);
        for (let w = 0; w < wateringCount; w++) {
            const logDate = new Date(date);
            logDate.setHours(8 + w * 3, 0, 0, 0); // Étaler dans la journée
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

    // ── Paramètres & Accès ───────────────────────────────────────
    await Setting.create({
        component_id: pumpVerger.id,
        auto_mode: true,
        threshold_min: 35.0, // Seuil sur l'humidité modbus0
        irrigation_duration: 600,
    });

    await Setting.create({
        component_id: valveSecteur.id,
        auto_mode: true,
        threshold_min: 40.0,
        irrigation_duration: 300,
    });

    await Access.create({ user_id: lamine.id, controller_id: ctrlReal.id });

    console.log('\n--- VERIFICATION DES IDS ---');
    console.log(`ID Contrôleur Real: ${ctrlReal.id}`);
    const checkComps = await Component.findAll({ where: { controller_id: ctrlReal.id } });
    console.log(`Nombre de composants liés: ${checkComps.length}`);
    checkComps.forEach(c => {
        if (c.controller_id !== ctrlReal.id) {
            console.error(`❌ ERREUR: Composant ${c.label} a un controller_id DIFFERENT: ${c.controller_id}`);
        }
    });

    console.log('\n🌱 Base de données prête pour le RS485 !');
}

module.exports = seed;

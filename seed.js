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

async function main() {
    console.log('🔄 Synchronisation de la base de données...');
    await sequelize.sync({ force: true });

    // ── Utilisateurs ─────────────────────────────────────────────
    const lamine = await User.create({
        email: 'lamine@agrotech.com',
        password: 'password123',
        phone: '+22300000000',
        first_name: 'Lamine',
        last_name: 'Sacko',
    });

    const amina = await User.create({
        email: 'amina@agrotech.com',
        password: 'password456',
        phone: '+22300000001',
        first_name: 'Amina',
        last_name: 'Diallo',
    });

    console.log(`✅ Utilisateurs créés : ${lamine.first_name}, ${amina.first_name}`);

    // ── Contrôleurs ──────────────────────────────────────────────
    const ctrl1 = await Controller.create({
        imei: '352099001761481',
        name: 'Contrôleur Parcelle Nord',
    });

    const ctrl2 = await Controller.create({
        imei: '352099001761482',
        name: 'Contrôleur Parcelle Sud',
    });

    console.log(`✅ Contrôleurs créés : ${ctrl1.name}, ${ctrl2.name}`);

    // ── Composants (capteurs & actionneurs) ──────────────────────
    // Parcelle Nord
    const sensorTemp = await Component.create({
        controller_id: ctrl1.id,
        type: 'sensor',
        pin_number: 'D2',
        label: 'Capteur température sol',
    });

    const sensorHumidity = await Component.create({
        controller_id: ctrl1.id,
        type: 'sensor',
        pin_number: 'D3',
        label: 'Capteur humidité sol',
    });

    const pumpNorth = await Component.create({
        controller_id: ctrl1.id,
        type: 'actuator',
        pin_number: 'D5',
        label: 'Pompe irrigation Nord',
    });

    // Parcelle Sud
    const sensorLight = await Component.create({
        controller_id: ctrl2.id,
        type: 'sensor',
        pin_number: 'A0',
        label: 'Capteur luminosité',
    });

    const pumpSouth = await Component.create({
        controller_id: ctrl2.id,
        type: 'actuator',
        pin_number: 'D6',
        label: 'Pompe irrigation Sud',
    });

    console.log(`✅ ${5} composants créés`);

    // ── Relevés des capteurs ──────────────────────────────────────
    const now = new Date();
    const readings = [];
    for (let i = 0; i < 5; i++) {
        const ts = new Date(now.getTime() - i * 15 * 60 * 1000); // toutes les 15 min
        readings.push(
            { component_id: sensorTemp.id,     value: 18.5 + i * 0.4, created_at: ts },
            { component_id: sensorHumidity.id, value: 62.0 - i * 1.2, created_at: ts },
            { component_id: sensorLight.id,    value: 780  + i * 10,  created_at: ts },
        );
    }
    await Reading.bulkCreate(readings);
    console.log(`✅ ${readings.length} relevés créés`);

    // ── Paramètres des actionneurs ────────────────────────────────
    await Setting.create({
        component_id: pumpNorth.id,
        auto_mode: true,
        threshold_min: 40.0,   // déclenche si humidité < 40 %
        irrigation_duration: 300, // 5 minutes
    });

    await Setting.create({
        component_id: pumpSouth.id,
        auto_mode: false,
        threshold_min: 35.0,
        irrigation_duration: 180,
    });

    console.log(`✅ Paramètres actionneurs créés`);

    // ── Accès utilisateurs → contrôleurs ─────────────────────────
    await Access.create({ user_id: lamine.id, controller_id: ctrl1.id });
    await Access.create({ user_id: lamine.id, controller_id: ctrl2.id });
    await Access.create({ user_id: amina.id,  controller_id: ctrl1.id });

    console.log(`✅ Accès utilisateurs créés`);

    // ── Logs d'activité ──────────────────────────────────────────
    await ActivityLog.bulkCreate([
        {
            controller_id: ctrl1.id,
            user_id: lamine.id,
            event_type: 'IRRIGATION_START',
            description: 'Irrigation déclenchée automatiquement (humidité < seuil)',
            timestamp: new Date(now.getTime() - 30 * 60 * 1000),
        },
        {
            controller_id: ctrl1.id,
            user_id: lamine.id,
            event_type: 'IRRIGATION_STOP',
            description: 'Irrigation arrêtée après 5 minutes',
            timestamp: new Date(now.getTime() - 25 * 60 * 1000),
        },
        {
            controller_id: ctrl2.id,
            user_id: null,
            event_type: 'SENSOR_ALERT',
            description: 'Luminosité anormalement basse détectée',
            timestamp: new Date(now.getTime() - 10 * 60 * 1000),
        },
    ]);

    console.log(`✅ Logs d'activité créés`);
    console.log('\n🌱 Base de données remplie avec succès !');
}

main()
    .catch((e) => console.error('❌ Erreur seed :', e))
    .finally(async () => await sequelize.close());
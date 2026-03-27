const {
    Controller,
} = require('./models');

async function seed() {
    // ── CONTRÔLEUR (GALILEOSKY) ───────────────────────────────────
    const [ctrlReal] = await Controller.findOrCreate({
        where: { imei: '865513072734987' },
        defaults: {
            id: '57292f5e-01b3-4e44-8390-dbc319efd96b',
            name: 'Galileosky Verger',
        }
    });

    console.log(`✅ Contrôleur réel prêt : ${ctrlReal.name} (IMEI: ${ctrlReal.imei})`);
    console.log('\n🌱 Base de données initialisée avec le boîtier uniquement !');
}

module.exports = seed;

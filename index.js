const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const errorHandler = require('./middlewares/errorHandler');

// ── Routes ───────────────────────────────────────────────────────
const userRoutes = require('./routes/user.routes');
const readingRoutes = require('./routes/reading.routes');

const app = express();


app.use(cors());
app.use(express.json());

app.use('/users', userRoutes);
app.use('/readings', readingRoutes);

// ── Gestion centralisée des erreurs (toujours en dernier) ────────
app.use(errorHandler);

// ── CRON / Interval : Suppression automatique ────────────────────
setInterval(async () => {
    try {
        const { Reading } = require('./models');
        const deletedRows = await Reading.destroy({ where: {} }); // Supprime toutes les lignes
        console.log(`🗑️ [CRON] ${deletedRows} relevés (readings) supprimés.`);
    } catch (err) {
        console.error('❌ [CRON] Erreur lors de la suppression des relevés :', err);
    }
}, 3600000); // 1 heure = 3600000 ms

// ── Démarrage ────────────────────────────────────────────────────
sequelize.sync({ alter: true }).then(async () => {
    console.log('Base de données synchronisée.');

    // On lance le seed au démarrage
    const seed = require('./seed');
    try {
        await seed();
    } catch (err) {
        console.error('❌ Erreur lors du seed au démarrage :', err);
    }

    // On ne démarre le serveur TCP qu'une fois la base prête
    const tcpServer = require('./shared/tcpServer');

    app.listen(3000, () => {
        console.log('Serveur Backend démarré sur http://localhost:3000');
    });
}).catch((err) => {
    console.error('Erreur de connexion à la base de données :', err);
});

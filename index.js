const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const errorHandler = require('./middlewares/errorHandler');

// ── Routes ───────────────────────────────────────────────────────
const controllerRoutes = require('./routes/controller.routes');
const readingRoutes = require('./routes/reading.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/readings', readingRoutes);
app.use('/controllers', controllerRoutes);

// ── Gestion centralisée des erreurs (toujours en dernier) ────────
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────────────
sequelize.sync({ force: false }).then(async () => {

    console.log('Base de données synchronisée.');

    const seed = require('./seed');
    try {
        await seed();
    } catch (err) {
        console.error('❌ Erreur lors du seed au démarrage :', err);
    }

    // On ne démarre le serveur TCP qu'une fois la base prête
    const tcpServer = require('./shared/tcpServer');
    await tcpServer.restoreTimersOnStartup();

    app.listen(3000, () => {
        console.log('Serveur Backend démarré sur http://localhost:3000');
    });
}).catch((err) => {
    console.error('Erreur de connexion à la base de données :', err);
});

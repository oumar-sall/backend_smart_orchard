require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./shared/logger');

// ── Routes ───────────────────────────────────────────────────────
const controllerRoutes = require('./routes/controller.routes');
const readingRoutes = require('./routes/reading.routes');
const activityLogRoutes = require('./routes/activityLog.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/readings', readingRoutes);
app.use('/controllers', controllerRoutes);
app.use('/activity-logs', activityLogRoutes);
app.use('/auth', authRoutes);

// ── Gestion centralisée des erreurs (toujours en dernier) ────────
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────────────
sequelize.sync().then(async () => {

    logger.info('✅ Base de données synchronisée.');

    // On ne démarre le serveur TCP qu'une fois la base prête
    try {
        const tcpServer = require('./shared/tcpServer');
        await tcpServer.restoreTimersOnStartup();
        logger.info('🚀 Serveur TCP prêt et timers restaurés sur le port 5000.');
    } catch (tcpErr) {
        logger.error('❌ Erreur lors du démarrage du serveur TCP :', tcpErr);
    }

    app.listen(3000, '0.0.0.0', () => {
        logger.info('🌐 Serveur Backend (API) démarré sur le port 3000');
    });
}).catch((err) => {
    logger.error('💥 ERREUR CRITIQUE DE SYNCHRONISATION DB :', err);
    console.error(err);
});

require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const logger = require('./shared/logger');

sequelize.sync().then(async () => {
    logger.info('Database synchronized.');

    try {
        const tcpServer = require('./shared/tcpServer');
        tcpServer.start();
    } catch (tcpErr) {
        logger.error('TCP server startup error:', tcpErr);
    }

    app.listen(3000, '0.0.0.0', () => {
        logger.info('Backend API server started on port 3000.');
    });
}).catch((err) => {
    logger.error('Critical database sync error:', err);
    process.exit(1);
});

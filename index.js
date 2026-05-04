require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const logger = require('./shared/logger');

logger.info('Starting database synchronization (110k+ records may take a moment)...');
sequelize.sync().then(async () => {
    logger.info('✅ Database synchronized and ready.');

    try {
        const MaintenanceService = require('./shared/maintenance.service');
        const tcpServer = require('./shared/tcpServer');
        
        // Start TCP server and maintenance in parallel
        tcpServer.start();
        MaintenanceService.purgeOldData();
    } catch (err) {
        logger.error('Startup services error:', err);
    }

    const port = process.env.PORT || 3000;
    app.listen(port, '0.0.0.0', () => {
        logger.info(`Backend API server started on port ${port}.`);
    });
}).catch((err) => {
    logger.error('Critical database sync error:', err);
    process.exit(1);
});

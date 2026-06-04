require('dotenv').config();
const { sequelize } = require('./models');
const logger = require('./shared/logger');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./config/swagger');
const errorHandler = require('./middlewares/errorHandler');

const controllerRoutes = require('./routes/controller.routes');
const readingRoutes = require('./routes/reading.routes');
const activityLogRoutes = require('./routes/activityLog.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();

// Clean up console logs: ignore repetitive polling requests if they are successful
app.use(morgan('dev', {
    skip: function (req, res) {
        return req.url.includes('/readings/') && res.statusCode < 400;
    }
}));
app.use(cors());
app.use(express.json());

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

// Routes
app.use('/readings', readingRoutes);
app.use('/controllers', controllerRoutes);
app.use('/activity-logs', activityLogRoutes);
app.use('/auth', authRoutes);

// Error handling
app.use(errorHandler);

logger.info('Starting database synchronization...');
sequelize.sync().then(async () => {
    logger.info('✅ Database synchronized and ready.');

    try {
        const MaintenanceService = require('./shared/maintenance.service');
        const IrrigationService = require('./shared/irrigation.service');
        const tcpServer = require('./shared/tcpServer');
        
        // Start services
        tcpServer.start();
        MaintenanceService.purgeOldData();
        IrrigationService.startMonitoring();

        // Schedule maintenance
        setInterval(() => {
            MaintenanceService.purgeOldData();
        }, 24 * 60 * 60 * 1000);
    } catch (err) {
        logger.error('Startup services error:', err);
    }

    const port = process.env.PORT || 3000;
    console.log(`HTTP Port = ${port}`);
    app.listen(port, '0.0.0.0', () => {
        logger.info(`Backend API server started on port ${port}.`);
    });
}).catch((err) => {
    logger.error('Critical database sync error:', err);
    process.exit(1);
});

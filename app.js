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

module.exports = app;

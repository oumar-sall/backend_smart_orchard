const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const errorHandler = require('./middlewares/errorHandler');

const controllerRoutes = require('./routes/controller.routes');
const readingRoutes = require('./routes/reading.routes');
const activityLogRoutes = require('./routes/activityLog.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Routes
app.use('/readings', readingRoutes);
app.use('/controllers', controllerRoutes);
app.use('/activity-logs', activityLogRoutes);
app.use('/auth', authRoutes);

// Error handling
app.use(errorHandler);

module.exports = app;

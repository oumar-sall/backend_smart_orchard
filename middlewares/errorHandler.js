const { AppError } = require('./errors');
const logger = require('../shared/logger');

function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.name,
            message: err.message,
        });
    }

    if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
            error: 'ValidationError',
            message: err.errors.map((e) => e.message).join(', '),
        });
    }

    logger.error('[Unhandled Error]', { message: err.message, stack: err.stack });
    res.status(500).json({
        error: 'InternalServerError',
        message: 'Une erreur interne est survenue',
    });
}

module.exports = errorHandler;

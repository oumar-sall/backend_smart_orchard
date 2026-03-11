const { AppError } = require('./errors');

/**
 * Middleware de gestion centralisée des erreurs.
 * À monter en dernier dans index.js : app.use(errorHandler)
 */
function errorHandler(err, req, res, next) {
    // Erreur métier typée (NotFoundError, etc.)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.name,
            message: err.message,
        });
    }

    // Erreur Sequelize de validation
    if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
            error: 'ValidationError',
            message: err.errors.map((e) => e.message).join(', '),
        });
    }

    // Erreur imprévue
    console.error('[Unhandled Error]', err);
    res.status(500).json({
        error: 'InternalServerError',
        message: 'Une erreur interne est survenue',
    });
}

module.exports = errorHandler;

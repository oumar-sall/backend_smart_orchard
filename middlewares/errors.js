/**
 * Typed application errors
 * Allow the errorHandler to select the correct HTTP status code automatically
 */

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Ressource introuvable') {
        super(message, 404);
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Requête invalide') {
        super(message, 400);
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflit de données') {
        super(message, 409);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Non authentifié') {
        super(message, 401);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Accès interdit') {
        super(message, 403);
    }
}

module.exports = {
    AppError,
    NotFoundError,
    BadRequestError,
    ConflictError,
    UnauthorizedError,
    ForbiddenError,
};

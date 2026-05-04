const { AppError, NotFoundError, ForbiddenError } = require('../../middlewares/errors');

describe('Custom error classes', () => {
    test('AppError stores the status code and message', () => {
        const err = new AppError('Something went wrong', 422);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Something went wrong');
        expect(err.statusCode).toBe(422);
    });

    test('NotFoundError defaults to HTTP 404', () => {
        const err = new NotFoundError('Resource not found');
        expect(err.statusCode).toBe(404);
    });

    test('ForbiddenError defaults to HTTP 403', () => {
        const err = new ForbiddenError('Access denied');
        expect(err.statusCode).toBe(403);
    });
});

const request = require('supertest');
const app = require('../../app');
const { sequelize } = require('../../models');

describe('Auth Integration Tests', () => {
    // Before running tests, sync the in-memory database
    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    // Close DB connection after tests
    afterAll(async () => {
        await sequelize.close();
    });

    describe('POST /auth/login', () => {
        test('Should create a new user and return a token', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({ phone: '0601020304' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user.phone).toBe('0601020304');
            expect(response.body.message).toContain('Compte cree');
        });

        test('Should return 400 if phone is missing', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({});

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBeDefined();
        });
    });
});

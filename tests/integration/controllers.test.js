const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Controller, Access } = require('../../models');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('Controller Integration Tests', () => {
    let token;
    let user;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        
        // Create a test user
        user = await User.create({
            phone: '0600000000',
            first_name: 'Test',
            last_name: 'User'
        });

        // Generate token
        token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET);
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('GET /controllers', () => {
        test('Should return 401 if no token provided', async () => {
            const response = await request(app).get('/controllers');
            expect(response.statusCode).toBe(401);
        });

        test('Should return empty list if user has no controllers', async () => {
            const response = await request(app)
                .get('/controllers')
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.statusCode).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(0);
        });

        test('Should return controllers linked to the user', async () => {
            // Create a controller and link it
            const controller = await Controller.create({
                name: 'Orchard Alpha',
                imei: '123456789012345'
            });
            
            await Access.create({
                user_id: user.id,
                controller_id: controller.id
            });

            const response = await request(app)
                .get('/controllers')
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.statusCode).toBe(200);
            expect(response.body.length).toBe(1);
            expect(response.body[0].name).toBe('Orchard Alpha');
        });
    });
});

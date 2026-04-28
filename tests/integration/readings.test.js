const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Controller, Component, Reading, Access } = require('../../models');
const jwt = require('jsonwebtoken');

// Mock hardware services
jest.mock('../../shared/tcpServer');
jest.mock('../../shared/sms');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('Readings Integration Tests', () => {
    let token;
    let user;
    let controller;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        
        user = await User.create({ 
            phone: '0611223344',
            first_name: 'Test',
            last_name: 'User'
        });
        token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET);
        
        controller = await Controller.create({ name: 'Smart Orchard', imei: '999888777666555' });
        await Access.create({ user_id: user.id, controller_id: controller.id });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('GET /readings/dashboard', () => {
        test('Should return latest readings for sensors', async () => {
            // 1. Create a sensor component
            const sensor = await Component.create({
                controller_id: controller.id,
                type: 'sensor',
                pin_number: 'A0',
                label: 'Temperature',
                unit: '°C'
            });

            // 2. Create a reading
            await Reading.create({
                component_id: sensor.id,
                value: 24.5
            });

            // 3. Request dashboard
            const response = await request(app)
                .get('/readings/dashboard')
                .query({ controller_id: controller.id })
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.sensors).toBeDefined();
            const tempSensor = response.body.sensors.find(s => s.title === 'Temperature');
            expect(tempSensor.value).toBe(24.5);
        });

        test('Should handle actuators status correctly', async () => {
            const actuator = await Component.create({
                controller_id: controller.id,
                type: 'actuator',
                pin_number: '1',
                label: 'Irrigation Valve'
            });

            const response = await request(app)
                .get('/readings/dashboard')
                .query({ controller_id: controller.id })
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            const valve = response.body.actuators.find(a => a.label === 'Irrigation Valve');
            expect(valve.active).toBe(false);
        });
    });
});

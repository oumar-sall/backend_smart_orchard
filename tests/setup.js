// Set a dummy JWT secret so tests don't rely on a real .env file
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

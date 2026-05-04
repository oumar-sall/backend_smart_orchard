// Mocking the SMS service to avoid sending real SMS during tests
module.exports = {
    sendSms: jest.fn().mockReturnValue(true)
};

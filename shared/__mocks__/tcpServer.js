// Mocking the TCP server to avoid socket errors during tests
module.exports = {
    clients: new Map(),
    sendCommand: jest.fn().mockReturnValue(true),
    restoreTimersOnStartup: jest.fn().mockResolvedValue(true),
    runAutoIrrigationCheck: jest.fn().mockResolvedValue(true)
};

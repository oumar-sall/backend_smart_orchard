module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    collectCoverageFrom: [
        'controllers/**/*.js',
        'middlewares/**/*.js',
        'shared/**/*.js',
        '!shared/tcpServer.js',
    ],
};

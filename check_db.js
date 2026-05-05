const { sequelize, Reading } = require('./models');

async function check() {
    try {
        const tableInfo = await sequelize.getQueryInterface().describeTable('readings');
        console.log('Columns in "readings" table:');
        console.log(JSON.stringify(tableInfo, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error describing table:', err);
        process.exit(1);
    }
}

check();

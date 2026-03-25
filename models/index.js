const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../data/dev.db'),
    logging: false,
});

// Import des modèles
const Controller  = require('./controller')(sequelize);
const Component   = require('./component')(sequelize);
const Reading     = require('./reading')(sequelize);
const Setting     = require('./setting')(sequelize);
const ActivityLog = require('./activityLog')(sequelize);

// ── Associations ────────────────────────────────────────────────

// Controller → Component (1-N)
Controller.hasMany(Component, { foreignKey: 'controller_id', onDelete: 'CASCADE' });
Component.belongsTo(Controller, { foreignKey: 'controller_id' });

// Component → Reading (1-N)
Component.hasMany(Reading, { foreignKey: 'component_id', onDelete: 'CASCADE' });
Reading.belongsTo(Component, { foreignKey: 'component_id' });

// Component → Setting (1-1)
Component.hasOne(Setting, { foreignKey: 'component_id', onDelete: 'CASCADE' });
Setting.belongsTo(Component, { foreignKey: 'component_id' });

// Controller → ActivityLog (1-N)
Controller.hasMany(ActivityLog, { foreignKey: 'controller_id', onDelete: 'CASCADE' });
ActivityLog.belongsTo(Controller, { foreignKey: 'controller_id' });

// ── Export ───────────────────────────────────────────────────────
module.exports = {
    sequelize,
    Controller,
    Component,
    Reading,
    Setting,
    ActivityLog,
};

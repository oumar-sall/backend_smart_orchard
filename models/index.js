const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../data/dev.db'),
    logging: false,
});

// Import des modèles
const User        = require('./user')(sequelize);
const Controller  = require('./controller')(sequelize);
const Component   = require('./component')(sequelize);
const Reading     = require('./reading')(sequelize);
const Setting     = require('./setting')(sequelize);
const Access      = require('./access')(sequelize);
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

// User <-> Controller via Access (N-N)
User.hasMany(Access, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Controller.hasMany(Access, { foreignKey: 'controller_id', onDelete: 'CASCADE' });
Access.belongsTo(User, { foreignKey: 'user_id' });
Access.belongsTo(Controller, { foreignKey: 'controller_id' });

// Controller → ActivityLog (1-N)
Controller.hasMany(ActivityLog, { foreignKey: 'controller_id', onDelete: 'CASCADE' });
ActivityLog.belongsTo(Controller, { foreignKey: 'controller_id' });

// User → ActivityLog (1-N, optionnel)
User.hasMany(ActivityLog, { foreignKey: 'user_id' });
ActivityLog.belongsTo(User, { foreignKey: 'user_id' });

// ── Export ───────────────────────────────────────────────────────
module.exports = {
    sequelize,
    User,
    Controller,
    Component,
    Reading,
    Setting,
    Access,
    ActivityLog,
};

const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '../data/dev.db'),
    logging: false,
    dialectOptions: {
        foreignKeys: true // Pour que Sequelize active les PRAGMA si possible
    },
    // Backup pour s'assurer que c'est activé sur chaque connexion
    pool: {
        afterConnect: (conn, cb) => {
            conn.run('PRAGMA foreign_keys = ON', cb);
        }
    }
});

// Import des modèles
const Controller  = require('./controller')(sequelize);
const Component   = require('./component')(sequelize);
const Reading     = require('./reading')(sequelize);
const Setting     = require('./setting')(sequelize);
const ActivityLog = require('./activityLog')(sequelize);
const User        = require('./user')(sequelize);
const Access      = require('./access')(sequelize);

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

// Setting ↔ Component (Optional sensor reference)
Setting.belongsTo(Component, { as: 'Sensor', foreignKey: 'sensor_id', onDelete: 'SET NULL' });
Component.hasMany(Setting, { as: 'AffectedSettings', foreignKey: 'sensor_id', onDelete: 'SET NULL' });

// Controller → ActivityLog (1-N)
Controller.hasMany(ActivityLog, { foreignKey: 'controller_id', onDelete: 'CASCADE' });
ActivityLog.belongsTo(Controller, { foreignKey: 'controller_id' });
 
// ── Associations d'accès Utilisateurs ───────────────────────────
 
// User ↔ Controller (M:N via Access)
User.belongsToMany(Controller, { through: Access, foreignKey: 'user_id' });
Controller.belongsToMany(User, { through: Access, foreignKey: 'controller_id' });
 
Controller.hasMany(Access, { foreignKey: 'controller_id', onDelete: 'CASCADE' });
 
// User → Access (1-N)
User.hasMany(Access, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Access.belongsTo(User, { foreignKey: 'user_id' });

// User → ActivityLog (1-N)
User.hasMany(ActivityLog, { foreignKey: 'user_id', onDelete: 'CASCADE' });
ActivityLog.belongsTo(User, { foreignKey: 'user_id' });



// ── Export ───────────────────────────────────────────────────────
module.exports = {
    sequelize,
    Controller,
    Component,
    Reading,
    Setting,
    ActivityLog,
    User,
    Access,
};

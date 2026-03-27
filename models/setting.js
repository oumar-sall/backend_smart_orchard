const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Setting = sequelize.define('Setting', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        component_id: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
        },
        auto_mode: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        threshold_min: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        irrigation_duration: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        reporting_interval: {
            type: DataTypes.INTEGER,
            defaultValue: 30,
        },
        sensor_id: {
            type: DataTypes.UUID,
            allowNull: true, // Peut être nul si pas de capteur associé
        },
    }, {

        tableName: 'settings',
        timestamps: false,
    });

    return Setting;
};

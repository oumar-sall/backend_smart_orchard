const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Component = sequelize.define('Component', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        controller_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING, // 'sensor' ou 'actuator'
            allowNull: false,
        },
        pin_number: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        label: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        unit: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        min_value: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        max_value: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        v_min: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0.0,
        },
        v_max: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 10.0,
        },
        timer_end: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'components',
        timestamps: false,
    });

    return Component;
};

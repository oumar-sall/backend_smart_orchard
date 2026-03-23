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

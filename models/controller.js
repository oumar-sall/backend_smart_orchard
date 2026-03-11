const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Controller = sequelize.define('Controller', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        imei: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    }, {
        tableName: 'controllers',
        timestamps: false,
    });

    return Controller;
};

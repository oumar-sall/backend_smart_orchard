const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Reading = sequelize.define('Reading', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        component_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'readings',
        timestamps: false,
    });

    return Reading;
};

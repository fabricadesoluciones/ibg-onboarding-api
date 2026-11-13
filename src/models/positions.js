const Sequelize = require('sequelize');

class positions extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init(
      {
        id: {
          autoIncrement: true,
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
          primaryKey: true,
        },
        area_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
        },
        department_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'positions',
        modelName: 'positions',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        indexes: [
          {
            unique: true,
            name: 'positions_unique_department_name',
            fields: ['department_id', 'name'],
          },
        ],
      }
    );
  }
}

module.exports = (sequelize, DataTypes) => {
  return positions.init(sequelize, DataTypes);
};

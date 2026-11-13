const Sequelize = require('sequelize');

class departments extends Sequelize.Model {
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
        tableName: 'departments',
        modelName: 'departments',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        indexes: [
          {
            unique: true,
            name: 'departments_unique_area_name',
            fields: ['area_id', 'name'],
          },
        ],
      }
    );
  }
}

module.exports = (sequelize, DataTypes) => {
  return departments.init(sequelize, DataTypes);
};

const Sequelize = require('sequelize');

class roles extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        autoIncrement: true,
        type: DataTypes.BIGINT.UNSIGNED, // <--- DataTypes viene del argumento de arriba
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      area_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      department_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      position_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      }
    }, {
      sequelize,
      tableName: 'roles',
      modelName: 'roles',
      timestamps: true,
      paranoid: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
      indexes: [
        {
          unique: true,
          name: "roles_unique_scope_name",
          fields: ["area_id", "department_id", "position_id", "name"],
        },
      ],
    });
  }
}

module.exports = (sequelize, DataTypes) => {
  return roles.init(sequelize, DataTypes);
};

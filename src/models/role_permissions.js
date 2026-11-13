const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return role_permissions.init(sequelize, DataTypes);
}

class role_permissions extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    permission_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    create_permission: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    update_permission: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    delete_permission: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    synchronize_permission: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    view_permission: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    tableName: 'role_permissions',
    timestamps: false,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
        ]
      },
      {
        name: "role_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "role_id" },
          { name: "permission_id" },
        ]
      },
    ]
  });
  }
}

const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return users.init(sequelize, DataTypes);
}

class users extends Sequelize.Model {
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
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: "email"
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'inactive'),
      allowNull: false,
      defaultValue: 'pending'
    },
    temporary_password: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    email_verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    activation_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    password_reset_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    last_failed_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_ldap: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    microsoft_payload: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mfa_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 1
    }
  }, {
    sequelize,
    tableName: 'users',
    timestamps: true,
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
        name: "email",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "email" },
        ]
      },
    ]
  });
  }
}

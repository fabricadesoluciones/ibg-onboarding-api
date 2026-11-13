const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return user_sessions.init(sequelize, DataTypes);
}

class user_sessions extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    session_jwt_token: {
      type: DataTypes.STRING(512),
      allowNull: true,
      unique: "session_jwt_token"
    },
    session_mfa_token: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: "session_mfa_token"
    },
    mfa_code_hash: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    mfa_code_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    mfa_verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 1
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'user_sessions',
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
        name: "session_jwt_token",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "session_jwt_token" },
        ]
      },
      {
        name: "session_mfa_token",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "session_mfa_token" },
        ]
      },
    ]
  });
  }
}

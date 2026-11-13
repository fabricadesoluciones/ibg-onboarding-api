const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return password_reset_tokens.init(sequelize, DataTypes);
}

class password_reset_tokens extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        primaryKey: true
      },
      token: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      used_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    }, {
      sequelize,
      tableName: 'password_reset_tokens',
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "email" },
          ]
        },
        {
          name: "password_reset_tokens_token_unique",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "token" },
          ]
        },
      ]
    });
  }
}

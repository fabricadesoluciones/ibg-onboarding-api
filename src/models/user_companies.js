const Sequelize = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  return user_companies.init(sequelize, DataTypes);
}

class user_companies extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        autoIncrement: true,
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
      },
      company_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
      }
    }, {
      sequelize,
      tableName: 'user_companies',
      timestamps: true,
      paranoid: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at"
    });
  }
}

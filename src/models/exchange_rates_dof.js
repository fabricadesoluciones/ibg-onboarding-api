const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return exchange_rates_dof.init(sequelize, DataTypes);
}

class exchange_rates_dof extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    currency_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    rate: {
      type: DataTypes.DECIMAL(10,4),
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'exchange_rates_dof',
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
        name: "currency_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "currency_id" },
          { name: "date" },
        ]
      },
    ]
  });
  }
}

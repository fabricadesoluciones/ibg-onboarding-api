const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return purchase_orders.init(sequelize, DataTypes);
}

class purchase_orders extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    intelisis_folio: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: "intelisis_folio"
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    cost_center_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    currency_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "Active"
    },
    issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'purchase_orders',
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
        name: "intelisis_folio",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "intelisis_folio" },
        ]
      },
    ]
  });
  }
}

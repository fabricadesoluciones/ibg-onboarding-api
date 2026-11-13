const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return invoice_purchase_order.init(sequelize, DataTypes);
}

class invoice_purchase_order extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    purchase_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    applied_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'invoice_purchase_order',
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
    ]
  });
  }
}

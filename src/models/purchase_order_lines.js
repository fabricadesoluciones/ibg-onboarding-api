const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return purchase_order_lines.init(sequelize, DataTypes);
}

class purchase_order_lines extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    purchase_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_code: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    total_quantity: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false
    },
    received_quantity: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true,
      defaultValue: 0.00
    },
    unit_price: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'purchase_order_lines',
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

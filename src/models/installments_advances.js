const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return installments_advances.init(sequelize, DataTypes);
}

class installments_advances extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    purchase_order_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    installment_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1
    },
    amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    scheduled_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    payment_status: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "Scheduled"
    }
  }, {
    sequelize,
    tableName: 'installments_advances',
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

const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return reconciliations.init(sequelize, DataTypes);
}

class reconciliations extends Sequelize.Model {
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
    bank_transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    reconciled_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    reconciliation_type: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "Reconciled"
    },
    discrepancy_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: true,
      defaultValue: 0.00
    },
    discrepancy_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'reconciliations',
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
    ]
  });
  }
}

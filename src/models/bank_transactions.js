const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return bank_transactions.init(sequelize, DataTypes);
}

class bank_transactions extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    account_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    transaction_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    reference: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_reconciled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'bank_transactions',
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

const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return business_rules.init(sequelize, DataTypes);
}

class business_rules extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: "supplier_id"
    },
    payment_terms_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 30
    },
    credit_limit: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: true
    },
    advance_payment_percentage: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: true,
      defaultValue: 0.00
    },
    early_payment_discount_pct: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: true,
      defaultValue: 0.00
    },
    penalty_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'business_rules',
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
        name: "supplier_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "supplier_id" },
        ]
      },
    ]
  });
  }
}

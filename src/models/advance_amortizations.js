const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return advance_amortizations.init(sequelize, DataTypes);
}

class advance_amortizations extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    advance_installment_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    target_invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    applied_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    applied_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'advance_amortizations',
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

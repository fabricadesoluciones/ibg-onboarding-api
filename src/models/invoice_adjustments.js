const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return invoice_adjustments.init(sequelize, DataTypes);
}

class invoice_adjustments extends Sequelize.Model {
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
    adjustment_type: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    applied_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'invoice_adjustments',
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

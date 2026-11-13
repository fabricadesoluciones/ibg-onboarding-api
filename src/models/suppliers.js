const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return suppliers.init(sequelize, DataTypes);
}

class suppliers extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_type: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    tax_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: "tax_id"
    },
    legal_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    sat_validation: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    approval_status: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "Pending"
    }
  }, {
    sequelize,
    tableName: 'suppliers',
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
      {
        name: "tax_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "tax_id" },
        ]
      },
    ]
  });
  }
}

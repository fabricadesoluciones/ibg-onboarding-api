const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return companies.init(sequelize, DataTypes);
}

class companies extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    tax_id: {
      type: DataTypes.STRING(13),
      allowNull: false,
      unique: "tax_id"
    },
    legal_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 1
    }
  }, {
    sequelize,
    tableName: 'companies',
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

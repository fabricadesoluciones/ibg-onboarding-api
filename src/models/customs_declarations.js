const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return customs_declarations.init(sequelize, DataTypes);
}

class customs_declarations extends Sequelize.Model {
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
    declaration_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: "declaration_number"
    },
    customs_broker: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    arrival_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'customs_declarations',
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
        name: "declaration_number",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "declaration_number" },
        ]
      },
    ]
  });
  }
}

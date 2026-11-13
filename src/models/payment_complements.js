const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return payment_complements.init(sequelize, DataTypes);
}

class payment_complements extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    installment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: "installment_id"
    },
    uuid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: "uuid"
    },
    amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    xml_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    pdf_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    sat_validation: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'payment_complements',
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
        name: "installment_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "installment_id" },
        ]
      },
      {
        name: "uuid",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "uuid" },
        ]
      },
    ]
  });
  }
}

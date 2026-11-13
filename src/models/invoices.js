const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return invoices.init(sequelize, DataTypes);
}

class invoices extends Sequelize.Model {
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
      allowNull: false
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    currency_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    invoice_type: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    uuid: {
      type: DataTypes.STRING(36),
      allowNull: true,
      unique: "unique_uuid"
    },
    foreign_folio: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    subtotal_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    tax_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    total_amount: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    remaining_balance: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: false
    },
    xml_path: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    pdf_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "Under Review"
    },
    issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    payment_calculation_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    sat_validation_successful: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'invoices',
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
        name: "unique_uuid",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "uuid" },
        ]
      },
      {
        name: "unique_folio_supplier",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "supplier_id" },
          { name: "foreign_folio" },
        ]
      },
    ]
  });
  }
}

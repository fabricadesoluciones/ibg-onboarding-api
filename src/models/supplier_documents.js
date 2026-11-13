const Sequelize = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  return supplier_documents.init(sequelize, DataTypes);
}

class supplier_documents extends Sequelize.Model {
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
    document_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    is_validated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    uploaded_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'supplier_documents',
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

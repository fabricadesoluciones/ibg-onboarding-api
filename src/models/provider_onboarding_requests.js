const Sequelize = require("sequelize");

module.exports = (sequelize, DataTypes) =>
  provider_onboarding_requests.init(sequelize, DataTypes);

class provider_onboarding_requests extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init(
      {
        id: {
          autoIncrement: true,
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
          primaryKey: true,
        },
        user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: "provider_onboarding_requests_user_id" },
        supplier_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        scope: { type: DataTypes.ENUM("nacional", "internacional"), allowNull: false },
        request_type: { type: DataTypes.ENUM("alta", "cambio"), allowNull: false, defaultValue: "alta" },
        person_type: { type: DataTypes.ENUM("fisica", "moral", "gob"), allowNull: false },
        legal_name: { type: DataTypes.STRING(255), allowNull: false },
        tax_id: { type: DataTypes.STRING(50), allowNull: false },
        status: { type: DataTypes.ENUM("draft", "documents_pending", "submitted", "approved", "rejected"), allowNull: false, defaultValue: "documents_pending" },
        form_data: { type: DataTypes.JSON, allowNull: false },
        contacts: { type: DataTypes.JSON, allowNull: false },
      },
      {
        sequelize,
        tableName: "provider_onboarding_requests",
        timestamps: true,
        paranoid: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        deletedAt: "deleted_at",
      },
    );
  }
}

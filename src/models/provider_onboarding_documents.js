const Sequelize = require("sequelize");

module.exports = (sequelize, DataTypes) => provider_onboarding_documents.init(sequelize, DataTypes);

class provider_onboarding_documents extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, allowNull: false, primaryKey: true },
      onboarding_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      document_type: { type: DataTypes.STRING(50), allowNull: false },
      original_name: { type: DataTypes.STRING(255), allowNull: true },
      file_path: { type: DataTypes.STRING(500), allowNull: true },
      mime_type: { type: DataTypes.STRING(100), allowNull: true },
      file_size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      valid_from: { type: DataTypes.DATEONLY, allowNull: true },
      valid_until: { type: DataTypes.DATEONLY, allowNull: true },
      is_indefinite: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      not_applicable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      not_applicable_reason: { type: DataTypes.TEXT, allowNull: true },
      validation_status: { type: DataTypes.ENUM("pending", "approved", "rejected"), allowNull: false, defaultValue: "pending" },
      is_blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      blocked_reason: { type: DataTypes.STRING(500), allowNull: true },
      blocked_at: { type: DataTypes.DATE, allowNull: true },
    }, {
      sequelize, tableName: "provider_onboarding_documents", timestamps: true, paranoid: true,
      createdAt: "created_at", updatedAt: "updated_at", deletedAt: "deleted_at",
    });
  }
}

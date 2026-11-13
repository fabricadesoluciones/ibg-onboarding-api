const Sequelize = require("sequelize");

module.exports = (sequelize, DataTypes) => provider_bank_accounts.init(sequelize, DataTypes);

class provider_bank_accounts extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, allowNull: false, primaryKey: true },
      onboarding_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      bank_name: { type: DataTypes.STRING(150), allowNull: false },
      bank_country: { type: DataTypes.STRING(100), allowNull: true },
      branch: { type: DataTypes.STRING(100), allowNull: true },
      reference: { type: DataTypes.STRING(255), allowNull: true },
      account_number: { type: DataTypes.STRING(50), allowNull: false },
      clabe_iban: { type: DataTypes.STRING(80), allowNull: false },
      is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      validation_status: { type: DataTypes.ENUM("pending_validation", "validated", "blocked"), allowNull: false, defaultValue: "pending_validation" },
      validated_at: { type: DataTypes.DATE, allowNull: true },
      validated_by_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      is_blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      blocked_reason: { type: DataTypes.STRING(500), allowNull: true },
      blocked_at: { type: DataTypes.DATE, allowNull: true },
      blocked_by_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      validation_reset_reason: { type: DataTypes.STRING(500), allowNull: true },
      validation_reset_at: { type: DataTypes.DATE, allowNull: true },
    }, { sequelize, tableName: "provider_bank_accounts", timestamps: true, paranoid: true, createdAt: "created_at", updatedAt: "updated_at", deletedAt: "deleted_at" });
  }
}

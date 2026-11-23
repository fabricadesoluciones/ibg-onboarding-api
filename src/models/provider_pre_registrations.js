const Sequelize = require("sequelize");
module.exports = (sequelize, DataTypes) => provider_pre_registrations.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  company_code: { type: DataTypes.STRING(30), allowNull: false },
  legal_name: { type: DataTypes.STRING(255), allowNull: false },
  tax_id: { type: DataTypes.STRING(50), allowNull: false },
  email: { type: DataTypes.STRING(150), allowNull: false },
  scope: { type: DataTypes.ENUM("nacional", "internacional"), allowNull: false },
  status: { type: DataTypes.ENUM("draft", "sent", "completed", "expired", "cancelled"), allowNull: false },
  invited_by_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  provider_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  sent_at: DataTypes.DATE, expires_at: DataTypes.DATE, cancelled_at: DataTypes.DATE,
}, { sequelize, tableName: "provider_pre_registrations", timestamps: true, paranoid: true, createdAt: "created_at", updatedAt: "updated_at", deletedAt: "deleted_at" });
class provider_pre_registrations extends Sequelize.Model {}

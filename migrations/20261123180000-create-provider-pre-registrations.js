"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("provider_pre_registrations", {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      company_code: { type: Sequelize.STRING(30), allowNull: false },
      legal_name: { type: Sequelize.STRING(255), allowNull: false },
      tax_id: { type: Sequelize.STRING(50), allowNull: false },
      email: { type: Sequelize.STRING(150), allowNull: false },
      scope: { type: Sequelize.ENUM("nacional", "internacional"), allowNull: false },
      status: { type: Sequelize.ENUM("draft", "sent", "completed", "expired", "cancelled"), allowNull: false, defaultValue: "draft" },
      invited_by_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      provider_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      cancelled_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex("provider_pre_registrations", ["company_code", "status"]);
    await queryInterface.addIndex("provider_pre_registrations", ["tax_id"]);
    await queryInterface.addIndex("provider_pre_registrations", ["email"]);
  },
  async down(queryInterface) { await queryInterface.dropTable("provider_pre_registrations"); },
};

const express = require("express");
const router = express.Router();

const {
  migrateDatabase,
  migrateOnboardingRequests,
  migrateOnboardingDocuments,
  migrateOnboardingBankCfoFlow,
  migrateProviderPreRegistrations,
  migrateRolePermissions,
  migrateCompaniesAndUserCompanies,
  migrateProviderAuthFields,
  migrateUserSessionsMfaFields,
  migratePasswordResetTokens,
  migrateMicrosoftPayloadField,
  migrateSessionJwtTokenLength,
  migrateOrganizationalCatalogsAndRoleScope,
  migrateUsersRoleOptional,
  migrateAuditLogs,
  migrateUserRoles,
} = require("../controllers/dev");

router.post("/migrate", migrateDatabase);
router.post("/migrate-onboarding-requests", migrateOnboardingRequests);
router.post("/migrate-onboarding-documents", migrateOnboardingDocuments);
router.post("/migrate-onboarding-bank-cfo-flow", migrateOnboardingBankCfoFlow);
router.post("/migrate-provider-pre-registrations", migrateProviderPreRegistrations);
router.post("/migrate-role-permissions", migrateRolePermissions);
router.post("/migrate-companies-user-companies", migrateCompaniesAndUserCompanies);
router.post("/migrate-provider-auth-fields", migrateProviderAuthFields);
router.post("/migrate-user-sessions-mfa-fields", migrateUserSessionsMfaFields);
router.post("/migrate-password-reset-tokens", migratePasswordResetTokens);
router.post("/migrate-microsoft-payload-field", migrateMicrosoftPayloadField);
router.post("/migrate-session-jwt-token-length", migrateSessionJwtTokenLength);
router.post("/migrate-organizational-catalogs-role-scope", migrateOrganizationalCatalogsAndRoleScope);
router.post("/migrate-users-role-optional", migrateUsersRoleOptional);
router.post("/migrate-audit-logs", migrateAuditLogs);
router.post("/migrate-user-roles", migrateUserRoles);

module.exports = router;

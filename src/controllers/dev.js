const path = require("path");
const { execFile } = require("child_process");
const Sequelize = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../config/logger");
const { sequelize } = require("../models/connection");

let migrationInProgress = false;

const isDevelopmentEnvironment = () => {
  const values = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.ENVIRONMENT,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (!values.length) {
    return true;
  }

  return values.some(
    (value) => value.includes("dev") || value.includes("local")
  );
};

const runSequelizeMigrations = () =>
  new Promise((resolve, reject) => {
    let sequelizeCliEntry;

    try {
      // Resolución dinámica: Node localiza la librería sin importar la estructura de carpetas en AWS
      sequelizeCliEntry = require.resolve("sequelize-cli/lib/sequelize");
    } catch (err) {
      // Respaldo de ruta clásica en caso de que require.resolve falle
      const backendRoot = path.resolve(__dirname, "../../");
      sequelizeCliEntry = path.join(
        backendRoot,
        "node_modules",
        "sequelize-cli",
        "lib",
        "sequelize"
      );
    }

    execFile(
      process.execPath,
      [sequelizeCliEntry, "db:migrate", "--env", "development"],
      {
        // Se omite 'cwd' estático ya que la resolución es dinámica
        env: {
          ...process.env,
          // Mapeo seguro de la contraseña para que Sequelize CLI la reconozca al ejecutar
          DB_PASSWORD: process.env.DB_PASSWORD || process.env.DB_PWD,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });

const runSpecificMigration = (migrationFileName) =>
  new Promise((resolve, reject) => {
    let sequelizeCliEntry;

    try {
      sequelizeCliEntry = require.resolve("sequelize-cli/lib/sequelize");
    } catch (err) {
      const backendRoot = path.resolve(__dirname, "../../");
      sequelizeCliEntry = path.join(
        backendRoot,
        "node_modules",
        "sequelize-cli",
        "lib",
        "sequelize"
      );
    }

    execFile(
      process.execPath,
      [
        sequelizeCliEntry,
        "db:migrate",
        "--env",
        "development",
        "--to",
        migrationFileName,
      ],
      {
        env: {
          ...process.env,
          DB_PASSWORD: process.env.DB_PASSWORD || process.env.DB_PWD,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });

const repairOnboardingRequests = async (queryInterface) => {
  await queryInterface.createTable("provider_onboarding_requests", {
    id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, allowNull: false, primaryKey: true },
    user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true },
    supplier_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
    scope: { type: Sequelize.ENUM("nacional", "internacional"), allowNull: false },
    request_type: { type: Sequelize.ENUM("alta", "cambio"), allowNull: false, defaultValue: "alta" },
    person_type: { type: Sequelize.ENUM("fisica", "moral", "gob"), allowNull: false },
    legal_name: { type: Sequelize.STRING(255), allowNull: false },
    tax_id: { type: Sequelize.STRING(50), allowNull: false },
    status: { type: Sequelize.ENUM("draft", "documents_pending", "submitted", "approved", "rejected"), allowNull: false, defaultValue: "documents_pending" },
    form_data: { type: Sequelize.JSON, allowNull: false },
    contacts: { type: Sequelize.JSON, allowNull: false },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    deleted_at: { type: Sequelize.DATE, allowNull: true },
  });
  await queryInterface.addIndex("provider_onboarding_requests", ["supplier_id"]);
  await queryInterface.addIndex("provider_onboarding_requests", ["tax_id"]);
};

const repairOnboardingDocuments = async (queryInterface) => {
  await queryInterface.createTable("provider_onboarding_documents", {
    id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, allowNull: false, primaryKey: true },
    onboarding_request_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    document_type: { type: Sequelize.STRING(50), allowNull: false },
    original_name: { type: Sequelize.STRING(255), allowNull: true },
    file_path: { type: Sequelize.STRING(500), allowNull: true },
    mime_type: { type: Sequelize.STRING(100), allowNull: true },
    file_size: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    valid_from: { type: Sequelize.DATEONLY, allowNull: true },
    valid_until: { type: Sequelize.DATEONLY, allowNull: true },
    is_indefinite: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    not_applicable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    not_applicable_reason: { type: Sequelize.TEXT, allowNull: true },
    validation_status: { type: Sequelize.ENUM("pending", "approved", "rejected"), allowNull: false, defaultValue: "pending" },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    deleted_at: { type: Sequelize.DATE, allowNull: true },
  });
  await queryInterface.addIndex("provider_onboarding_documents", ["onboarding_request_id", "document_type"], { name: "idx_onb_doc_request_type" });
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  const columns = await queryInterface.describeTable(tableName);
  if (!columns[columnName]) await queryInterface.addColumn(tableName, columnName, definition);
};

const repairOnboardingBankCfoFlow = async (queryInterface) => {
  await addColumnIfMissing(queryInterface, "provider_onboarding_documents", "is_blocked", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumnIfMissing(queryInterface, "provider_onboarding_documents", "blocked_reason", { type: Sequelize.STRING(500), allowNull: true });
  await addColumnIfMissing(queryInterface, "provider_onboarding_documents", "blocked_at", { type: Sequelize.DATE, allowNull: true });
  await queryInterface.createTable("provider_bank_accounts", {
    id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, allowNull: false, primaryKey: true },
    onboarding_request_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    bank_name: { type: Sequelize.STRING(150), allowNull: false },
    bank_country: { type: Sequelize.STRING(100), allowNull: true },
    branch: { type: Sequelize.STRING(100), allowNull: true },
    reference: { type: Sequelize.STRING(255), allowNull: true },
    account_number: { type: Sequelize.STRING(50), allowNull: false },
    clabe_iban: { type: Sequelize.STRING(80), allowNull: false },
    is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    validation_status: { type: Sequelize.ENUM("pending_validation", "validated", "blocked"), allowNull: false, defaultValue: "pending_validation" },
    validated_at: { type: Sequelize.DATE, allowNull: true },
    validated_by_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
    is_blocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    blocked_reason: { type: Sequelize.STRING(500), allowNull: true },
    blocked_at: { type: Sequelize.DATE, allowNull: true },
    blocked_by_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
    validation_reset_reason: { type: Sequelize.STRING(500), allowNull: true },
    validation_reset_at: { type: Sequelize.DATE, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    deleted_at: { type: Sequelize.DATE, allowNull: true },
  });
  await queryInterface.addIndex("provider_bank_accounts", ["onboarding_request_id"], { name: "idx_bank_account_request" });
  await queryInterface.addIndex("provider_bank_accounts", ["validation_status"], { name: "idx_bank_account_validation" });
};

const schemaRepairs = {
  "20261111120000-create-provider-onboarding-requests.js": repairOnboardingRequests,
  "20261112153000-create-provider-onboarding-documents.js": repairOnboardingDocuments,
  "20261112160000-add-document-blocking-and-bank-cfo-flow.js": repairOnboardingBankCfoFlow,
};

const ensureMigrationTables = async (migrationFileName, requiredTables) => {
  if (!requiredTables.length) return false;

  const queryInterface = sequelize.getQueryInterface();
  const existingTables = await queryInterface.showAllTables();
  const existingNames = new Set(existingTables.map((table) => String(table).toLowerCase()));
  const missingTables = requiredTables.filter((table) => !existingNames.has(table.toLowerCase()));

  if (!missingTables.length) return false;

  // SequelizeMeta puede decir que una migracion se ejecuto aunque la tabla se
  // haya eliminado o nunca se haya creado. Reparamos el esquema real.
  try {
    const migration = require(path.resolve(__dirname, "../../migrations", migrationFileName));
    await migration.up(queryInterface, Sequelize);
  } catch (error) {
    const repair = schemaRepairs[migrationFileName];
    const migrationFileMissing = error.code === "MODULE_NOT_FOUND" && error.message.includes("/migrations/");
    if (!repair || !migrationFileMissing) throw error;
    await repair(queryInterface);
  }

  const repairedTables = await queryInterface.showAllTables();
  const repairedNames = new Set(repairedTables.map((table) => String(table).toLowerCase()));
  const stillMissing = requiredTables.filter((table) => !repairedNames.has(table.toLowerCase()));
  if (stillMissing.length) {
    throw new Error(`La migracion no creo las tablas requeridas: ${stillMissing.join(", ")}`);
  }

  return true;
};

const migrateSpecific = (migrationFileName, successMessage, requiredTables = []) => asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const repaired = await ensureMigrationTables(migrationFileName, requiredTables);
    const output = [stdout, stderr, repaired ? "Esquema reparado porque faltaban tablas registradas como migradas." : null]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.info("Specific migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: successMessage,
      data: { migration: migrationFileName, output },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Specific migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion",
      details: { error: error.message, output: output || null },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateOnboardingRequests = migrateSpecific(
  "20261111120000-create-provider-onboarding-requests.js",
  "Migracion de solicitudes de onboarding ejecutada correctamente",
  ["provider_onboarding_requests"]
);

const migrateOnboardingDocuments = migrateSpecific(
  "20261112153000-create-provider-onboarding-documents.js",
  "Migracion de documentos de onboarding ejecutada correctamente",
  ["provider_onboarding_documents"]
);

const migrateOnboardingBankCfoFlow = migrateSpecific(
  "20261112160000-add-document-blocking-and-bank-cfo-flow.js",
  "Migracion de flujo bancario y CFO de onboarding ejecutada correctamente",
  ["provider_bank_accounts"]
);

const migrateProviderPreRegistrations = migrateSpecific(
  "20261123180000-create-provider-pre-registrations.js",
  "Migracion de prealtas de proveedores ejecutada correctamente",
  ["provider_pre_registrations"]
);

const migrateOnboardingDocumentRules = migrateSpecific(
  "20261123210000-create-onboarding-document-rules.js",
  "Migracion de catálogo de documentos y vigencias ejecutada correctamente",
  ["onboarding_document_rules"]
);

const migrateOnboardingDocumentValidation = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError("Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local", 403);
  }
  if (migrationInProgress) return res.status(409).json({ code: 0, message: "Ya hay una ejecución de migraciones en curso" });
  migrationInProgress = true;
  try {
    const queryInterface = sequelize.getQueryInterface();
    const table = "provider_onboarding_documents";
    await addColumnIfMissing(queryInterface, table, "validated_by_user_id", { type: Sequelize.BIGINT.UNSIGNED, allowNull: true });
    await addColumnIfMissing(queryInterface, table, "validated_at", { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, table, "validation_notes", { type: Sequelize.TEXT, allowNull: true });
    const indexes = await queryInterface.showIndex(table);
    if (!indexes.some((index) => index.name === "idx_onb_doc_validation_status")) {
      await queryInterface.addIndex(table, ["validation_status"], { name: "idx_onb_doc_validation_status" });
    }
    return res.json({ code: 1, message: "Migración de validación documental ejecutada correctamente." });
  } finally {
    migrationInProgress = false;
  }
});

const migrateDatabase = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const { stdout, stderr } = await runSequelizeMigrations();
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Local migrations executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
    });

    return res.status(200).json({
      code: 1,
      message: "Migraciones ejecutadas correctamente",
      data: {
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Local migrations failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudieron ejecutar las migraciones",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateRolePermissions = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260902120000-add-synchronize-permission-to-role-permissions.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Role permissions migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de role_permissions ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Role permissions migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de role_permissions",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateCompaniesAndUserCompanies = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260707110000-add-company-description-and-user-companies.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Companies and user_companies migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de companies y user_companies ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Companies and user_companies migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de companies y user_companies",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateProviderAuthFields = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260714180000-add-provider-auth-fields-to-users.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Provider auth fields migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de autenticacion de proveedores ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Provider auth fields migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de autenticacion de proveedores",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateUserSessionsMfaFields = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260518163000-add-mfa-code-fields-to-user-sessions.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("User sessions MFA fields migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de MFA en user_sessions ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("User sessions MFA fields migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de MFA en user_sessions",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migratePasswordResetTokens = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260715010000-create_password_reset_tokens.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Password reset tokens migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de password_reset_tokens ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Password reset tokens migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de password_reset_tokens",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateMicrosoftPayloadField = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260715103000-add-microsoft-payload-to-users.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Microsoft payload migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de microsoft_payload en users ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Microsoft payload migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de microsoft_payload en users",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateSessionJwtTokenLength = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260715234000-expand-session-jwt-token-length.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Session JWT token length migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de longitud de session_jwt_token ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Session JWT token length migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de longitud de session_jwt_token",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateOrganizationalCatalogsAndRoleScope = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260716090000-create-organizational-catalogs-and-role-scope.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Organizational catalogs and role scope migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de catalogos organizacionales y alcance de roles ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Organizational catalogs and role scope migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de catalogos organizacionales y alcance de roles",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateUsersRoleOptional = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260720120000-make-user-role-optional.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Users role optional migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion para permitir role_id nulo en users ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Users role optional migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion para permitir role_id nulo en users",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateAuditLogs = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName =
      "20260803123000-create_audit_logs.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("Audit logs migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de audit_logs ejecutada correctamente",
      data: {
        migration: migrationFileName,
        output,
      },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("Audit logs migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de audit_logs",
      details: {
        error: error.message,
        output: output || null,
      },
    });
  } finally {
    migrationInProgress = false;
  }
});

const migrateUserRoles = asyncHandler(async (req, res) => {
  if (!isDevelopmentEnvironment()) {
    throw new AppError(
      "Las migraciones por endpoint solo se pueden ejecutar en entornos de desarrollo/local",
      403
    );
  }

  if (migrationInProgress) {
    return res.status(409).json({
      code: 0,
      warning: true,
      message: "Ya hay una ejecucion de migraciones en curso",
    });
  }

  migrationInProgress = true;

  try {
    const migrationFileName = "20261118191000-add-id-to-user-roles.js";
    const { stdout, stderr } = await runSpecificMigration(migrationFileName);
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    logger.info("User roles migration executed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      migrationFileName,
    });

    return res.status(200).json({
      code: 1,
      message: "Migracion de user_roles ejecutada correctamente",
      data: { migration: migrationFileName, output },
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    logger.warn("User roles migration failed from endpoint", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(200).json({
      code: 0,
      warning: true,
      message: "Advertencia: no se pudo ejecutar la migracion de user_roles",
      details: { error: error.message, output: output || null },
    });
  } finally {
    migrationInProgress = false;
  }
});

module.exports = {
  migrateDatabase,
  migrateOnboardingRequests,
  migrateOnboardingDocuments,
  migrateOnboardingBankCfoFlow,
  migrateProviderPreRegistrations,
  migrateOnboardingDocumentRules,
  migrateOnboardingDocumentValidation,
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
};

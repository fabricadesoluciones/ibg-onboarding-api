const path = require("path");
const { execFile } = require("child_process");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../config/logger");

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

module.exports = {
  migrateDatabase,
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
};

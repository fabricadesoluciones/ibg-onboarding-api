const bcrypt = require("bcryptjs");

const DEV_ADMIN_EMAIL = "interno.local@ibgroup.com";
const DEV_ADMIN_PASSWORD = "123456";
const DEV_ADMIN_NAME = "Usuario Interno Local";
const DEV_ROLE_NAME = "admin";

const normalizePayload = (payload = {}) => ({
  email: payload.email || DEV_ADMIN_EMAIL,
  password: payload.password || DEV_ADMIN_PASSWORD,
  name: payload.name || DEV_ADMIN_NAME,
  roleName: payload.role_name || payload.roleName || DEV_ROLE_NAME,
  roleDescription:
    payload.role_description ||
    payload.roleDescription ||
    "Rol administrador para entorno local",
  isLdap: payload.is_ldap ?? true,
  mfaEnabled: payload.mfa_enabled ?? false,
  isActive: payload.is_active ?? true,
});

const isDevelopmentEnvironment = () => {
  const values = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.ENVIRONMENT,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (!values.length) {
    // This script is used for local bootstrap; default to local mode when
    // environment markers are missing.
    return true;
  }

  return values.some(
    (value) => value.includes("dev") || value.includes("local")
  );
};

const seedDevAdmin = async ({ roles: Role, users: User }, logger, payload = {}) => {
  if (!isDevelopmentEnvironment()) {
    logger.warn("Skipping admin seed: non-development environment detected");
    return {
      executed: false,
      reason: "non-development environment detected",
    };
  }

  const {
    email,
    password,
    name,
    roleName,
    roleDescription,
    isLdap,
    mfaEnabled,
    isActive,
  } = normalizePayload(payload);

  const [adminRole] = await Role.findOrCreate({
    where: { name: roleName },
    defaults: {
      description: roleDescription,
    },
  });

  const password_hash = await bcrypt.hash(password, 10);

  const [adminUser, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      role_id: adminRole.id,
      name,
      password_hash,
      is_ldap: isLdap,
      mfa_enabled: mfaEnabled,
      is_active: isActive,
    },
  });

  if (!created) {
    await adminUser.update({
      role_id: adminRole.id,
      name: name || adminUser.name || DEV_ADMIN_NAME,
      password_hash,
      is_ldap: isLdap,
      mfa_enabled: mfaEnabled,
      is_active: isActive,
    });
  }

  logger.info("Development admin user ready", {
    email,
    created,
  });

  return {
    executed: true,
    created,
    role: {
      id: adminRole.id,
      name: adminRole.name,
    },
    user: {
      id: adminUser.id,
      name: name || adminUser.name,
      email,
      role_id: adminRole.id,
      is_ldap: isLdap,
      mfa_enabled: mfaEnabled,
      is_active: isActive,
    },
  };
};

module.exports = seedDevAdmin;

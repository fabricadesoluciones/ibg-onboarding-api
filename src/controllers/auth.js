const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const {
  users: User,
  user_sessions: UserSession,
  role_permissions: RolePermission,
  password_reset_tokens: PasswordResetToken,
  areas: Area,
  departments: Department,
  positions: Position,
  roles: Role,
} = require("../models");
const { compare } = require("../utils/handlePasswors");
const { tokenSign } = require("../utils/handleJwt");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../config/logger");
const { sendMfaCodeEmail } = require("../services/mfaEmailService");
const { sendPasswordResetEmail } = require("../services/passwordResetEmailService");
const { createModuleAuditLogger } = require("../services/auditLogService");

const auditAuth = createModuleAuditLogger({
  moduleKey: "auth_security",
  moduleName: "Autenticación y Seguridad",
  targetType: "auth_event",
});

const parseExpiresInToMs = (value) => {
  if (!value) return 60 * 60 * 1000;
  if (typeof value === "number") return value * 1000;

  const str = String(value).trim().toLowerCase();
  const match = str.match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return 60 * 60 * 1000;

  const amount = Number(match[1]);
  const unit = match[2] || "s";
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] || 1000);
};

const parseMinutes = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const generateMfaCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const hashMfaCode = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

const isDevelopmentEnvironment = () => {
  const values = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.ENVIRONMENT,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return values.some(
    (value) => value.includes("dev") || value.includes("local")
  );
};

const shouldBypassMfaInLocal = () => {
  const override = String(process.env.MFA_BYPASS_IN_LOCAL || "")
    .trim()
    .toLowerCase();

  if (override === "false") {
    return false;
  }

  if (override !== "true") {
    return false;
  }

  const emailEnabled = String(process.env.MFA_EMAIL_ENABLED || "false")
    .trim()
    .toLowerCase() === "true";
  const mailConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ) || Boolean(process.env.RESEND_FROM || process.env.SES_SOURCE_EMAIL || process.env.SMTP_FROM);

  return override === "true" && !emailEnabled && !mailConfigured;
};

const isMfaRequiredForUser = (user) => {
  const globalMfa = String(process.env.MFA_FORCE_FOR_ALL || "false")
    .trim()
    .toLowerCase() === "true";

  return globalMfa || Boolean(user.mfa_enabled);
};

const getRolePermissions = async (roleId) => {
  if (!roleId) return [];

  const rolePermissions = await RolePermission.findAll({
    where: { role_id: roleId },
    attributes: [
      "permission_id",
      "create_permission",
      "update_permission",
      "delete_permission",
      "synchronize_permission",
      "view_permission",
    ],
    raw: true,
  });

  return rolePermissions
    .map((permission) => ({
      permission_id: Number(permission.permission_id),
      create_permission: Boolean(permission.create_permission),
      update_permission: Boolean(permission.update_permission),
      delete_permission: Boolean(permission.delete_permission),
      synchronize_permission: Boolean(permission.synchronize_permission),
      view_permission: Boolean(permission.view_permission),
    }))
    .filter((permission) => Number.isFinite(permission.permission_id));
};

const buildUserPayload = async (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role_id: user.role_id,
  password_reset_attempts: Number(user.password_reset_attempts || 0),
  microsoft_payload: user.microsoft_payload ?? null,
  permissions: await getRolePermissions(user.role_id),
});

const normalizePortalType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "proveedor" ? "proveedor" : "interno";
};

const isProviderPortalFirstAccessCandidate = (user, portalType) =>
  normalizePortalType(portalType) === "proveedor" &&
  !Boolean(user.is_ldap) &&
  Boolean(user.mfa_enabled) &&
  (Boolean(user.temporary_password) || String(user.status) === "pending");

const isProviderUser = (user) =>
  !Boolean(user?.is_ldap) && Boolean(user?.mfa_enabled);

const getResetPasswordBaseUrl = () => {
  const baseUrl =
    process.env.PROVIDER_PORTAL_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    "http://localhost:8080";

  return String(baseUrl).replace(/\/$/, "");
};

const buildResetPasswordLink = (token) =>
  `${getResetPasswordBaseUrl()}/reset-password/${encodeURIComponent(token)}`;

const getPasswordResetExpirationMinutes = () =>
  parseMinutes(process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES, 5);

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const incrementFailedLoginAttempt = async (user) => {
  const currentAttempts = Number(user.password_reset_attempts || 0);
  const nextAttempts = currentAttempts + 1;

  await User.update(
    {
      password_reset_attempts: nextAttempts,
      last_failed_login: new Date(),
    },
    { where: { id: user.id } }
  );

  return nextAttempts;
};

const resetFailedLoginAttemptCounter = async (user) => {
  await User.update(
    {
      password_reset_attempts: 0,
      last_failed_login: null,
    },
    { where: { id: user.id } }
  );
};

const getRequiredMicrosoftEnv = () => {
  const config = {
    clientId: process.env.ENTRA_CLIENT_ID,
    tenantId: process.env.ENTRA_TENANT_ID,
    clientSecret: process.env.ENTRA_CLIENT_SECRET,
    redirectUri: process.env.ENTRA_REDIRECT_URI,
  };
  // console.log(config);
  // debugger;
  const missing = Object.entries({
    ENTRA_CLIENT_ID: config.clientId,
    ENTRA_TENANT_ID: config.tenantId,
    ENTRA_CLIENT_SECRET: config.clientSecret,
    ENTRA_REDIRECT_URI: config.redirectUri,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new AppError(
      `Faltan variables de entorno para Microsoft SSO: ${missing.join(", ")}`,
      500
    );
  }

  return config;
};

const MICROSOFT_SSO_SCOPE = "openid profile email User.Read";
const GENERAL_CATALOG_NAME = "General";
const DEFAULT_INTERNAL_ROLE_NAMES = ["usuario", "operador", "user", "empleado", "colaborador"];

const exchangeMicrosoftCodeForToken = async (code) => {
  const { clientId, tenantId, clientSecret, redirectUri } =
    getRequiredMicrosoftEnv();

  const body = new URLSearchParams({
    client_id: clientId,
    scope: MICROSOFT_SSO_SCOPE,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    client_secret: clientSecret,
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      data?.error_description ||
        data?.error ||
        "No se pudo completar la autenticacion con Microsoft",
      401
    );
  }

  return data;
};

const fetchMicrosoftProfile = async (accessToken) => {
  if (!accessToken) {
    throw new AppError("Microsoft no devolvio access_token para consultar el perfil", 401);
  }

  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,givenName,surname,mail,userPrincipalName,department,companyName,jobTitle,officeLocation,mobilePhone,businessPhones,onPremisesExtensionAttributes",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      data?.error?.message ||
        "No se pudo consultar el perfil del usuario en Microsoft Graph",
      401
    );
  }

  return data;
};

const normalizeCatalogValue = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const firstNonEmptyValue = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const getMicrosoftClaims = (tokenResponse) => {
  const decodedIdToken = jwt.decode(tokenResponse?.id_token || null);
  return decodedIdToken && typeof decodedIdToken === "object" ? decodedIdToken : {};
};

const getMicrosoftExtensionAttribute2 = (microsoftProfile = null) => {
  const profile =
    microsoftProfile && typeof microsoftProfile === "object"
      ? microsoftProfile
      : {};

  return firstNonEmptyValue(
    profile?.onPremisesExtensionAttributes?.extensionAttribute2,
    profile?.onPremisesExtensionAttributes?.ExtensionAttribute2
  );
};

const extractMicrosoftOrganizationalData = (tokenResponse, microsoftProfile = null) => {
  const claims = getMicrosoftClaims(tokenResponse);
  const profile =
    microsoftProfile && typeof microsoftProfile === "object"
      ? microsoftProfile
      : {};
  const extensionAttribute2 = getMicrosoftExtensionAttribute2(profile);

  return {
    area: firstNonEmptyValue(
      extensionAttribute2,
      profile.area,
      profile.companyName,
      profile.officeLocation,
      claims.area,
      claims.companyName,
      claims.officeLocation,
      claims.physicalDeliveryOfficeName
    ),
    department: firstNonEmptyValue(profile.department, claims.department),
    position: firstNonEmptyValue(profile.jobTitle, claims.jobTitle, claims.title),
    raw_sources: {
      profile: {
        extensionAttribute2,
        companyName: profile.companyName || null,
        officeLocation: profile.officeLocation || null,
        department: profile.department || null,
        jobTitle: profile.jobTitle || null,
      },
      claims: {
        area: claims.area || null,
        companyName: claims.companyName || null,
        officeLocation: claims.officeLocation || null,
        physicalDeliveryOfficeName: claims.physicalDeliveryOfficeName || null,
        department: claims.department || null,
        jobTitle: claims.jobTitle || claims.title || null,
      },
    },
  };
};

const findCatalogItemByName = (items, name, extraPredicate = () => true) => {
  const normalizedName = normalizeCatalogValue(name);
  if (!normalizedName) return null;

  return (
    items.find(
      (item) =>
        extraPredicate(item) &&
        normalizeCatalogValue(item.name) === normalizedName
    ) || null
  );
};

const ensureCatalogItem = async ({
  model,
  name,
  where,
  payload,
  transaction = null,
}) => {
  const requestedName = firstNonEmptyValue(name, GENERAL_CATALOG_NAME);

  let item = await model.findOne({
    where: {
      ...where,
      name: requestedName,
    },
    paranoid: false,
    transaction,
  });

  if (item) {
    if (item.deleted_at) {
      await item.restore({ transaction });
    }

    return {
      item,
      created: false,
      restored: Boolean(item.deleted_at),
      requested_name: requestedName,
    };
  }

  item = await model.create(
    {
      ...payload,
      ...where,
      name: requestedName,
    },
    { transaction }
  );

  return {
    item,
    created: true,
    restored: false,
    requested_name: requestedName,
  };
};

const resolveInternalRoleFromOrganizationalData = async (organizationalData) => {
  const requestedAreaName = organizationalData?.area || null;
  const requestedDepartmentName = organizationalData?.department || null;
  const requestedPositionName = organizationalData?.position || null;

  return User.sequelize.transaction(async (transaction) => {
    const areaResolution = await ensureCatalogItem({
      model: Area,
      name: requestedAreaName,
      where: {},
      payload: {
        description: requestedAreaName
          ? "Creada automaticamente desde Microsoft SSO"
          : "Area general para Microsoft SSO",
      },
      transaction,
    });

    const departmentResolution = await ensureCatalogItem({
      model: Department,
      name: requestedDepartmentName,
      where: { area_id: areaResolution.item.id },
      payload: {
        description: requestedDepartmentName
          ? "Creado automaticamente desde Microsoft SSO"
          : "Departamento general para Microsoft SSO",
      },
      transaction,
    });

    const positionResolution = await ensureCatalogItem({
      model: Position,
      name: requestedPositionName,
      where: {
        area_id: areaResolution.item.id,
        department_id: departmentResolution.item.id,
      },
      payload: {
        description: requestedPositionName
          ? "Creado automaticamente desde Microsoft SSO"
          : "Puesto general para Microsoft SSO",
      },
      transaction,
    });

    const scopedRoles = await Role.findAll({
      attributes: ["id", "name", "area_id", "department_id", "position_id"],
      where: {
        area_id: areaResolution.item.id,
        department_id: departmentResolution.item.id,
        position_id: positionResolution.item.id,
      },
      order: [["id", "ASC"]],
      transaction,
    });

    const normalizedPosition = normalizeCatalogValue(requestedPositionName);
    const directMatchByRoleName = normalizedPosition
      ? scopedRoles.find((role) => normalizeCatalogValue(role.name) === normalizedPosition) || null
      : null;

    const defaultRoleMatch =
      scopedRoles.find((role) =>
        DEFAULT_INTERNAL_ROLE_NAMES.includes(normalizeCatalogValue(role.name))
      ) || null;

    const selectedRole =
      directMatchByRoleName ||
      defaultRoleMatch ||
      (scopedRoles.length === 1 ? scopedRoles[0] : null);

    if (selectedRole) {
      return {
        role: selectedRole,
        scope: {
          area: { id: Number(areaResolution.item.id), name: areaResolution.item.name },
          department: {
            id: Number(departmentResolution.item.id),
            name: departmentResolution.item.name,
          },
          position: {
            id: Number(positionResolution.item.id),
            name: positionResolution.item.name,
          },
        },
        available_roles: scopedRoles.map((role) => ({
          id: Number(role.id),
          name: role.name,
        })),
        selection_strategy: directMatchByRoleName
          ? "position_to_role_name"
          : defaultRoleMatch
            ? "default_internal_role_name"
            : "single_role_in_scope",
        catalog_resolution: {
          area_created: areaResolution.created,
          department_created: departmentResolution.created,
          position_created: positionResolution.created,
          requested_area_name: areaResolution.requested_name,
          requested_department_name: departmentResolution.requested_name,
          requested_position_name: positionResolution.requested_name,
        },
      };
    }

    return {
      role: null,
      scope: {
        area: { id: Number(areaResolution.item.id), name: areaResolution.item.name },
        department: {
          id: Number(departmentResolution.item.id),
          name: departmentResolution.item.name,
        },
        position: {
          id: Number(positionResolution.item.id),
          name: positionResolution.item.name,
        },
      },
      available_roles: scopedRoles.map((role) => ({
        id: Number(role.id),
        name: role.name,
      })),
      selection_strategy: "no_role_in_scope",
      catalog_resolution: {
        area_created: areaResolution.created,
        department_created: departmentResolution.created,
        position_created: positionResolution.created,
        requested_area_name: areaResolution.requested_name,
        requested_department_name: departmentResolution.requested_name,
        requested_position_name: positionResolution.requested_name,
        requested_scope_without_role: true,
        fallback_role_applied: false,
      },
    };
  });
};

const resolveMicrosoftUserProvisioning = async ({
  existingUser,
  tokenResponse,
  microsoftProfile,
  organizationalData,
  organizationalDataBase,
  email,
}) => {
  const resolution = await resolveInternalRoleFromOrganizationalData(
    organizationalData
  );

  const baseProvisioningDetails = {
    resolved_from: organizationalData,
    pre_graph_snapshot: organizationalDataBase,
    assigned_role: resolution.role
      ? {
          id: Number(resolution.role.id),
          name: resolution.role.name,
        }
      : null,
    catalog_scope: resolution.scope,
    available_roles_in_scope: resolution.available_roles,
    selection_strategy: resolution.selection_strategy,
    catalog_resolution: resolution.catalog_resolution,
  };

  if (!existingUser) {
    const createdUser = await User.create({
      role_id: resolution.role ? Number(resolution.role.id) : null,
      name: buildInternalUserNameFromMicrosoft(tokenResponse, microsoftProfile, email),
      email,
      password_hash: null,
      status: "active",
      temporary_password: false,
      email_verified_at: new Date(),
      activation_token: null,
      password_reset_attempts: 0,
      last_failed_login: null,
      is_ldap: 1,
      mfa_enabled: 0,
      is_active: 1,
    });

    return {
      user: createdUser,
      provisioningDetails: {
        action: "created_new_internal_user",
        ...baseProvisioningDetails,
      },
    };
  }

  const updates = {
    is_ldap: 1,
  };

  if (existingUser.deleted_at) {
    await existingUser.restore();
    updates.deleted_at = null;
  }

  if (!existingUser.is_active) {
    updates.is_active = 1;
    updates.status = "active";
  }

  if (!existingUser.email_verified_at) {
    updates.email_verified_at = new Date();
  }

  if (!existingUser.name || !String(existingUser.name).trim()) {
    updates.name = buildInternalUserNameFromMicrosoft(
      tokenResponse,
      microsoftProfile,
      email
    );
  }

  if (
    (existingUser.role_id === null || existingUser.role_id === undefined) &&
    resolution.role
  ) {
    updates.role_id = Number(resolution.role.id);
  }

  if (Object.keys(updates).length > 0) {
    await existingUser.update(updates);
  }

  return {
    user: existingUser,
    provisioningDetails: {
      action:
        existingUser.deleted_at || !existingUser.is_active
          ? "reactivated_existing_internal_user"
          : updates.role_id
            ? "updated_existing_internal_user_role"
            : "updated_existing_user",
      ...baseProvisioningDetails,
    },
  };
};

const buildInternalUserNameFromMicrosoft = (tokenResponse, microsoftProfile, email) => {
  const claims = getMicrosoftClaims(tokenResponse);
  const profile =
    microsoftProfile && typeof microsoftProfile === "object"
      ? microsoftProfile
      : {};

  return (
    firstNonEmptyValue(
      profile.displayName,
      claims.name,
      claims.displayName,
      claims.given_name && claims.family_name
        ? `${claims.given_name} ${claims.family_name}`
        : null,
      email ? email.split("@")[0] : null
    ) || "Usuario Interno"
  );
};

const getEmailFromMicrosoftToken = (idToken) => {
  const decoded = jwt.decode(idToken);

  if (!decoded || typeof decoded !== "object") {
    throw new AppError("No se pudo decodificar el id_token de Microsoft", 401);
  }

  const email =
    decoded.email || decoded.preferred_username || decoded.upn || null;

  if (!email || typeof email !== "string") {
    throw new AppError(
      "El token de Microsoft no contiene un correo valido",
      401
    );
  }

  return String(email).trim().toLowerCase();
};

const buildMicrosoftPayloadSnapshot = (
  tokenResponse,
  microsoftProfile = null,
  profileError = null,
  provisioning = null
) => {
  const decodedIdToken = getMicrosoftClaims(tokenResponse);
  const normalizedProfile =
    microsoftProfile && typeof microsoftProfile === "object"
      ? microsoftProfile
      : null;
  const organizationalData = extractMicrosoftOrganizationalData(
    tokenResponse,
    microsoftProfile
  );

  return JSON.stringify(
    {
      provider: "microsoft-entra-id",
      captured_at: new Date().toISOString(),
      token_type: tokenResponse?.token_type || null,
      scope: tokenResponse?.scope || null,
      expires_in: tokenResponse?.expires_in || null,
      ext_expires_in: tokenResponse?.ext_expires_in || null,
      organizational_data: organizationalData,
      provisioning,
      microsoft_profile: normalizedProfile,
      microsoft_profile_error: profileError
        ? {
            message: profileError.message || String(profileError),
          }
        : null,
      id_token_claims:
        decodedIdToken && typeof decodedIdToken === "object"
          ? decodedIdToken
          : null,
    },
    null,
    2
  );
};

const createJwtSession = async (user, options = {}) => {
  const portalType = normalizePortalType(options.portalType);
  const token = await tokenSign({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    portal_type: portalType,
  });

  const ttlMs = parseExpiresInToMs(process.env.JWT_EXPIRES_IN || "1h");
  const expiresAt = new Date(Date.now() + ttlMs);

  await UserSession.create({
    user_id: user.id,
    session_jwt_token: token,
    is_active: 1,
    expires_at: expiresAt,
    mfa_verified_at: new Date(),
  });

  return { token, expiresAt };
};

const createFirstAccessToken = async (user, options = {}) => {
  const portalType = normalizePortalType(options.portalType);
  const token = await tokenSign(
    {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      first_access: true,
      portal_type: portalType,
    },
    {
      expiresIn: process.env.FIRST_ACCESS_TOKEN_EXPIRES_IN || "30m",
    }
  );

  const ttlMs = parseExpiresInToMs(
    process.env.FIRST_ACCESS_TOKEN_EXPIRES_IN || "30m"
  );

  return {
    token,
    expiresAt: new Date(Date.now() + ttlMs),
  };
};

const issueMfaChallenge = async (user, options = {}) => {
  const { deliverEmail = true, includeCode = false } = options;
  const mfaCode = generateMfaCode();
  const mfaToken = uuidv4();
  const mfaExpiresInMinutes = parseMinutes(
    process.env.MFA_CODE_EXPIRES_IN_MINUTES,
    10
  );
  const expiresAt = new Date(Date.now() + mfaExpiresInMinutes * 60 * 1000);

  await UserSession.update(
    { is_active: 0 },
    {
      where: {
        user_id: user.id,
        is_active: 1,
        session_jwt_token: null,
      },
    }
  );

  await UserSession.create({
    user_id: user.id,
    session_mfa_token: mfaToken,
    mfa_code_hash: hashMfaCode(mfaCode),
    mfa_code_expires_at: expiresAt,
    is_active: 1,
    expires_at: expiresAt,
  });

  let deliveryError = null;

  if (deliverEmail) {
    try {
      await sendMfaCodeEmail({
        to: user.email,
        name: user.name,
        code: mfaCode,
        expiresInMinutes: mfaExpiresInMinutes,
      });
    } catch (error) {
      deliveryError = error;
      logger.error("No se pudo enviar el correo MFA; se continua con la solicitud", {
        userId: user.id,
        email: user.email,
        message: error.message,
      });
    }
  }

  const response = {
    code: 1,
    message: "Codigo de verificacion enviado",
    mfa_required: true,
    mfa_token: mfaToken,
    expires_at: expiresAt,
    user: await buildUserPayload(user),
  };

  if (includeCode || (deliveryError && isDevelopmentEnvironment())) {
    response.mfa_code = mfaCode;
  }

  if (deliveryError) {
    response.email_delivery_error = deliveryError.message;
  }

  return response;
};

const login = asyncHandler(async (req, res) => {
  const { email, password, portal_type } = req.body || {};

  if (!email || !password) {
    throw new AppError("Email y contrasena son requeridas", 400);
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({
    where: { email: normalizedEmail, is_active: 1 },
    raw: true,
  });

  if (!user || !user.password_hash) {
    throw new AppError("Credenciales invalidas", 401);
  }

  const ok = await compare(password, user.password_hash);
  if (!ok) {
    const nextAttempts = await incrementFailedLoginAttempt(user);
    throw new AppError("Credenciales invalidas", 401, {
      show_forgot_password: isProviderUser(user) && nextAttempts >= 3,
      password_reset_attempts: nextAttempts,
    });
  }

  await resetFailedLoginAttemptCounter(user);

  const portalType = normalizePortalType(portal_type);

  if (isProviderPortalFirstAccessCandidate(user, portalType)) {
    const { token, expiresAt } = await createFirstAccessToken(user, {
      portalType,
    });

    return res.status(200).json({
      code: 1,
      message: "Primer acceso requerido",
      token,
      expires_at: expiresAt,
      mfa_required: false,
      first_access_required: true,
      user: await buildUserPayload(user),
    });
  }

  if (shouldBypassMfaInLocal()) {
    const { token, expiresAt } = await createJwtSession(user, { portalType });

    await auditAuth(req, {
      action: "login",
      targetId: user.id,
      entityName: user.email,
      metadata: {
        portal_type: portalType,
        mfa_required: false,
        first_access_required: false,
      },
      description: `Inicio de sesion exitoso para ${user.email}`,
    });

    return res.status(200).json({
      code: 1,
      message: "Success",
      token,
      expires_at: expiresAt,
      mfa_required: false,
      first_access_required: false,
      user: await buildUserPayload(user),
    });
  }

  if (isMfaRequiredForUser(user)) {
    const challenge = await issueMfaChallenge(user);

    await auditAuth(req, {
      action: "mfa_challenge",
      targetId: user.id,
      entityName: user.email,
      metadata: {
        portal_type: portalType,
      },
      description: `Se genero un reto MFA para ${user.email}`,
    });

    return res.status(200).json(challenge);
  }

  const { token, expiresAt } = await createJwtSession(user);

  await auditAuth(req, {
    action: "login",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      portal_type: portalType,
      mfa_required: false,
      first_access_required: false,
    },
    description: `Inicio de sesion exitoso para ${user.email}`,
  });

  return res.status(200).json({
    code: 1,
    message: "Success",
    token,
    expires_at: expiresAt,
    mfa_required: false,
    first_access_required: false,
    user: await buildUserPayload(user),
  });
});

const loginDebugMfa = asyncHandler(async (req, res) => {
  const { email, password, portal_type } = req.body || {};

  if (!email || !password) {
    throw new AppError("Email y contrasena son requeridas", 400);
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({
    where: { email: normalizedEmail, is_active: 1 },
    raw: true,
  });

  if (!user || !user.password_hash) {
    throw new AppError("Credenciales invalidas", 401);
  }

  const ok = await compare(password, user.password_hash);
  if (!ok) {
    const nextAttempts = await incrementFailedLoginAttempt(user);
    throw new AppError("Credenciales invalidas", 401, {
      show_forgot_password: isProviderUser(user) && nextAttempts >= 3,
      password_reset_attempts: nextAttempts,
    });
  }

  await resetFailedLoginAttemptCounter(user);

  const portalType = normalizePortalType(portal_type);

  if (isProviderPortalFirstAccessCandidate(user, portalType)) {
    const { token, expiresAt } = await createFirstAccessToken(user, {
      portalType,
    });

    return res.status(200).json({
      code: 1,
      message: "Primer acceso requerido",
      token,
      expires_at: expiresAt,
      mfa_required: false,
      first_access_required: true,
      user: await buildUserPayload(user),
    });
  }

  if (isMfaRequiredForUser(user)) {
    const challenge = await issueMfaChallenge(user, {
      deliverEmail: false,
      includeCode: true,
    });

    await auditAuth(req, {
      action: "mfa_challenge_debug",
      targetId: user.id,
      entityName: user.email,
      metadata: {
        portal_type: portalType,
      },
      description: `Se genero un reto MFA debug para ${user.email}`,
    });

    return res.status(200).json({
      ...challenge,
      message: "Codigo de verificacion generado sin envio de correo",
    });
  }

  const { token, expiresAt } = await createJwtSession(user, { portalType });

  await auditAuth(req, {
    action: "login",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      portal_type: portalType,
      mfa_required: false,
      first_access_required: false,
      debug_mfa: true,
    },
    description: `Inicio de sesion debug exitoso para ${user.email}`,
  });

  return res.status(200).json({
    code: 1,
    message: "Success",
    token,
    expires_at: expiresAt,
    mfa_required: false,
    first_access_required: false,
    user: await buildUserPayload(user),
  })
});
const loginWithMicrosoftSso = asyncHandler(async (req, res) => {
  const { code } = req.body || {};

  if (!code) {
    throw new AppError("Code es requerido", 400);
  }

  const tokenResponse = await exchangeMicrosoftCodeForToken(code);
  const email = getEmailFromMicrosoftToken(tokenResponse.id_token);
  let microsoftProfile = null;
  let microsoftProfileError = null;
  const organizationalDataBase = extractMicrosoftOrganizationalData(
    tokenResponse,
    null
  );

  try {
    microsoftProfile = await fetchMicrosoftProfile(tokenResponse.access_token);
  } catch (error) {
    microsoftProfileError = error;
    logger.warn("No se pudo obtener el perfil extendido de Microsoft Graph", {
      email,
      message: error.message,
    });
  }

  const organizationalData = extractMicrosoftOrganizationalData(
    tokenResponse,
    microsoftProfile
  );

  let user = await User.findOne({
    where: { email },
    paranoid: false,
  });

  let provisioningDetails = {
    action: "updated_existing_user",
    resolved_from: organizationalData,
    pre_graph_snapshot: organizationalDataBase,
  };

  if (!user || user.deleted_at || !user.is_active || user.role_id == null) {
    const provisioned = await resolveMicrosoftUserProvisioning({
      existingUser: user,
      tokenResponse,
      microsoftProfile,
      organizationalData,
      organizationalDataBase,
      email,
    });

    user = provisioned.user;
    provisioningDetails = provisioned.provisioningDetails;
  }

  await user.update({
    is_ldap: 1,
    microsoft_payload: buildMicrosoftPayloadSnapshot(
      tokenResponse,
      microsoftProfile,
      microsoftProfileError,
      provisioningDetails
    ),
  });

  const { token } = await createJwtSession(user, { portalType: "interno" });

  await auditAuth(req, {
    action: "login_sso",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      provider: "microsoft",
      role_id: user.role_id,
      provisioning_action: provisioningDetails.action,
    },
    description: `Inicio de sesión SSO Microsoft para ${user.email}`,
  });

  return res.status(200).json({
    success: true,
    token,
    user: {
      ...(await buildUserPayload(user)),
      role: user.role_id,
    },
  });
});

const verifyMfa = asyncHandler(async (req, res) => {
  const { mfa_token, code, portal_type } = req.body || {};

  if (!mfa_token || !code) {
    throw new AppError("Token MFA y codigo son requeridos", 400);
  }

  const session = await UserSession.findOne({
    where: { session_mfa_token: mfa_token, is_active: 1 },
  });

  if (!session) {
    throw new AppError("Solicitud MFA invalida o expirada", 401);
  }

  if (
    !session.mfa_code_expires_at ||
    new Date(session.mfa_code_expires_at).getTime() < Date.now()
  ) {
    await session.update({ is_active: 0 });
    throw new AppError("El codigo de verificacion expiro", 401);
  }

  if (session.mfa_code_hash !== hashMfaCode(code)) {
    throw new AppError("Codigo de verificacion invalido", 401);
  }

  const user = await User.findOne({
    where: { id: session.user_id, is_active: 1 },
    raw: true,
  });

  if (!user) {
    await session.update({ is_active: 0 });
    throw new AppError("Usuario no encontrado", 404);
  }

  const token = await tokenSign({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    portal_type: normalizePortalType(portal_type),
  });
  const ttlMs = parseExpiresInToMs(process.env.JWT_EXPIRES_IN || "1h");
  const expiresAt = new Date(Date.now() + ttlMs);

  await session.update({
    session_jwt_token: token,
    session_mfa_token: null,
    mfa_code_hash: null,
    mfa_code_expires_at: null,
    mfa_verified_at: new Date(),
    expires_at: expiresAt,
  });

  await auditAuth(req, {
    action: "verify_mfa",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      portal_type: normalizePortalType(portal_type),
    },
    description: `Validación MFA exitosa para ${user.email}`,
  });

  return res.status(200).json({
    code: 1,
    message: "Success",
    token,
    expires_at: expiresAt,
    mfa_required: false,
    first_access_required: false,
    user: await buildUserPayload(user),
  });
});

const resendMfa = asyncHandler(async (req, res) => {
  const { mfa_token } = req.body || {};

  if (!mfa_token) {
    throw new AppError("Token MFA requerido", 400);
  }

  const session = await UserSession.findOne({
    where: { session_mfa_token: mfa_token, is_active: 1 },
  });

  if (!session) {
    throw new AppError("Solicitud MFA invalida o expirada", 401);
  }

  const user = await User.findOne({
    where: { id: session.user_id, is_active: 1 },
    raw: true,
  });

  if (!user) {
    await session.update({ is_active: 0 });
    throw new AppError("Usuario no encontrado", 404);
  }

  const mfaCode = generateMfaCode();
  const mfaExpiresInMinutes = parseMinutes(
    process.env.MFA_CODE_EXPIRES_IN_MINUTES,
    10
  );
  const expiresAt = new Date(Date.now() + mfaExpiresInMinutes * 60 * 1000);

  await session.update({
    mfa_code_hash: hashMfaCode(mfaCode),
    mfa_code_expires_at: expiresAt,
    expires_at: expiresAt,
  });

  try {
    await sendMfaCodeEmail({
      to: user.email,
      name: user.name,
      code: mfaCode,
      expiresInMinutes: mfaExpiresInMinutes,
    });
  } catch (error) {
    logger.error("No se pudo reenviar el correo MFA", {
      userId: user.id,
      email: user.email,
      message: error.message,
    });
  }

  await auditAuth(req, {
    action: "resend_mfa",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      expires_at: expiresAt,
    },
    description: `Reenvio de codigo MFA para ${user.email}`,
  });

  return res.status(200).json({
    code: 1,
    message: "Codigo reenviado",
    mfa_required: true,
    first_access_required: false,
    mfa_token,
    expires_at: expiresAt,
    user: await buildUserPayload(user),
  });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.token || (req.headers.authorization || "").split(" ").pop();

  if (!token) {
    throw new AppError("Token requerido", 400);
  }

  await UserSession.update(
    { is_active: 0 },
    { where: { session_jwt_token: token } }
  );

  await auditAuth(req, {
    action: "logout",
    targetId: req.user?.id || null,
    entityName: req.user?.email || "sesion",
    description: `Cierre de sesion de ${req.user?.email || "usuario"}`,
  });

  return res.status(200).json({ code: 1, message: "Logged out" });
});

const me = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const user = await User.findOne({
    where: { id: userId, is_active: 1 },
    raw: true,
  });

  if (!user) {
    throw new AppError("Unauthorized", 401);
  }

  return res.status(200).json({
    code: 1,
    message: "Success",
    first_access_required: false,
    user: await buildUserPayload(user),
  });
});

const firstAccessMe = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const user = await User.findOne({
    where: { id: userId, is_active: 1 },
    raw: true,
  });

  if (!user || !user.temporary_password || !user.mfa_enabled || user.is_ldap) {
    throw new AppError("Primer acceso no disponible", 403);
  }

  return res.status(200).json({
    code: 1,
    message: "Success",
    first_access_required: true,
    user: await buildUserPayload(user),
  });
});

const completeFirstAccess = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const portalType = normalizePortalType(req.user?.portal_type || "proveedor");
  const {
    current_password,
    temporary_password,
    new_password,
    password_confirmation,
    confirm_password,
  } = req.body || {};

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const providedCurrentPassword = current_password || temporary_password;
  const providedConfirmation = password_confirmation || confirm_password;

  if (!providedCurrentPassword || !new_password || !providedConfirmation) {
    throw new AppError("Debes completar todos los campos", 400);
  }

  if (String(new_password).trim().length < 8) {
    throw new AppError(
      "La nueva contrasena debe tener al menos 8 caracteres",
      400
    );
  }

  if (String(new_password) !== String(providedConfirmation)) {
    throw new AppError("La confirmacion de contrasena no coincide", 400);
  }

  const user = await User.findOne({
    where: { id: userId, is_active: 1 },
  });

  if (!user || !user.temporary_password || !user.mfa_enabled || user.is_ldap) {
    throw new AppError("Primer acceso no disponible", 403);
  }

  const validTemporaryPassword = await compare(
    String(providedCurrentPassword),
    user.password_hash
  );

  if (!validTemporaryPassword) {
    throw new AppError("La contrasena temporal no es valida", 401);
  }

  const password_hash = await bcrypt.hash(String(new_password), 10);

  await UserSession.update(
    { is_active: 0 },
    {
      where: {
        user_id: user.id,
        session_jwt_token: {
          [Op.ne]: null,
        },
      },
    }
  );

  await user.update({
    password_hash,
    temporary_password: false,
    status: "active",
    email_verified_at: new Date(),
    activation_token: null,
    password_reset_attempts: 0,
    last_failed_login: null,
  });

  const { token, expiresAt } = await createJwtSession(user, { portalType });

  await auditAuth(req, {
    action: "complete_first_access",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      portal_type: portalType,
    },
    description: `Primer acceso completado para ${user.email}`,
  });

  return res.status(200).json({
    code: 1,
    message: "Contrasena actualizada correctamente",
    token,
    expires_at: expiresAt,
    mfa_required: false,
    first_access_required: false,
    user: await buildUserPayload(user),
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const genericResponse = {
    code: 1,
    message: "Si el correo existe recibiras un enlace para recuperar tu contrasena.",
  };

  if (!email) {
    return res.status(200).json(genericResponse);
  }

  const user = await User.findOne({
    where: {
      email,
      is_active: 1,
    },
    raw: true,
  });

  if (!user || !isProviderUser(user)) {
    return res.status(200).json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashResetToken(rawToken);
  const expiresAt = new Date(
    Date.now() + getPasswordResetExpirationMinutes() * 60 * 1000
  );

  await PasswordResetToken.upsert({
    email,
    token: hashedToken,
    expires_at: expiresAt,
    used_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await sendPasswordResetEmail({
    to: user.email,
    resetLink: buildResetPasswordLink(rawToken),
    expiresInMinutes: getPasswordResetExpirationMinutes(),
  });

  await auditAuth(req, {
    action: "forgot_password",
    targetId: user.id,
    entityName: user.email,
    metadata: {
      expires_at: expiresAt,
    },
    description: `Se solicito recuperacion de contrasena para ${user.email}`,
  });

  return res.status(200).json(genericResponse);
});

const resetPassword = asyncHandler(async (req, res) => {
  const rawToken = String(req.params?.token || "").trim();
  const { new_password, password_confirmation, confirm_password } = req.body || {};
  const confirmation = password_confirmation || confirm_password;

  if (!rawToken || !new_password || !confirmation) {
    throw new AppError("Debes completar todos los campos", 400);
  }

  if (String(new_password).trim().length < 8) {
    throw new AppError(
      "La nueva contrasena debe tener al menos 8 caracteres",
      400
    );
  }

  if (String(new_password) !== String(confirmation)) {
    throw new AppError("La confirmacion de contrasena no coincide", 400);
  }

  const hashedToken = hashResetToken(rawToken);
  const passwordResetToken = await PasswordResetToken.findOne({
    where: {
      token: hashedToken,
      used_at: null,
    },
  });

  if (!passwordResetToken) {
    throw new AppError("El enlace de recuperacion es invalido o ya fue utilizado", 400);
  }

  if (
    !passwordResetToken.expires_at ||
    new Date(passwordResetToken.expires_at).getTime() < Date.now()
  ) {
    throw new AppError("El enlace de recuperacion ha expirado", 400);
  }

  const user = await User.findOne({
    where: {
      email: passwordResetToken.email,
      is_active: 1,
    },
  });

  if (!user || !isProviderUser(user)) {
    throw new AppError("El enlace de recuperacion es invalido", 400);
  }

  const password_hash = await bcrypt.hash(String(new_password), 10);

  await user.update({
    password_hash,
    temporary_password: false,
    status: "active",
    activation_token: null,
    email_verified_at: user.email_verified_at || new Date(),
    password_reset_attempts: 0,
    last_failed_login: null,
  });

  await passwordResetToken.update({
    used_at: new Date(),
  });

  await auditAuth(req, {
    action: "reset_password_public",
    targetId: user.id,
    entityName: user.email,
    description: `Se completo la recuperacion de contrasena para ${user.email}`,
  });

  return res.status(200).json({
    code: 1,
    message: "Contrasena actualizada correctamente.",
  });
});

module.exports = {
  login,
  loginWithMicrosoftSso,
  loginDebugMfa,
  verifyMfa,
  resendMfa,
  logout,
  me,
  firstAccessMe,
  completeFirstAccess,
  forgotPassword,
  resetPassword,
};

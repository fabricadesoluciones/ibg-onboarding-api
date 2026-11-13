const {
  users: User,
  roles: Role,
  companies: Company,
  user_companies: UserCompany,
  user_sessions: UserSession,
  password_reset_tokens: PasswordResetToken,
} = require("../models");
const bcrypt = require("bcryptjs");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../config/logger");
const seedDevAdmin = require("../seeders/seedDevAdmin");
const { Op, col, cast, where } = require("sequelize");
const crypto = require("crypto");
const { sendProviderWelcomeEmail } = require("../services/providerWelcomeEmailService");
const { sendProviderPasswordResetEmail } = require("../services/providerPasswordResetEmailService");
const { createModuleAuditLogger } = require("../services/auditLogService");

const AUDIT_MODULE_KEY = "internal_user_management";
const AUDIT_MODULE_NAME = "Gestion de Usuarios";
const auditUsers = createModuleAuditLogger({
  moduleKey: AUDIT_MODULE_KEY,
  moduleName: AUDIT_MODULE_NAME,
  targetType: "user",
});

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getPaginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const generateTemporaryPassword = (length = 8) => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = `${upper}${lower}${digits}`;
  const chars = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
  ];

  while (chars.length < length) {
    chars.push(all[crypto.randomInt(0, all.length)]);
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(0, index + 1);
    [chars[index], chars[randomIndex]] = [chars[randomIndex], chars[index]];
  }

  return chars.join("");
};

const buildUserStatus = (providerUser, isActive) =>
  providerUser ? "pending" : isActive ? "active" : "inactive";

const buildProviderLoginUrl = () => {
  const baseUrl =
    process.env.PROVIDER_PORTAL_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    "http://localhost:8080";

  return String(baseUrl).replace(/\/$/, "");
};

const isProviderRole = (role) =>
  Boolean(role?.name) &&
  String(role.name).trim().toLowerCase().includes("proveedor");

const isProviderUserPayload = ({ role, is_ldap, mfa_enabled }) =>
  !is_ldap && (Boolean(mfa_enabled) || isProviderRole(role));

const normalizeTextFilter = (value) => String(value ?? "").trim();
const parseOptionalPositiveInt = (value) => {
  const normalized = normalizeTextFilter(value);
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeFlagFilter = (value) => {
  const normalized = normalizeTextFilter(value).toLowerCase();
  if (!normalized) return null;
  if (["si", "sí", "yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
};

const getUserListQuery = async (query = {}) => {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const requestedLimit = parsePositiveInt(query.limit, DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const offset = (page - 1) * limit;
  const search = normalizeTextFilter(query.search);
  const idFilter = normalizeTextFilter(query.id);
  const nameFilter = normalizeTextFilter(query.name);
  const emailFilter = normalizeTextFilter(query.email);
  const roleFilter = normalizeTextFilter(query.role);
  const companyFilter = normalizeTextFilter(query.company);
  const companyIdFilter = parseOptionalPositiveInt(query.company);
  const internoFilter = normalizeFlagFilter(query.interno);
  const proveedorFilter = normalizeFlagFilter(query.proveedor);
  const activoFilter = normalizeFlagFilter(query.activo);
  const sortField = ["id", "name", "email"].includes(String(query.sortField))
    ? String(query.sortField)
    : "id";
  const sortOrder = String(query.sortOrder ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const whereClause = {};
  const andConditions = [];
  let companyInclude = userCompanyInclude;

  if (search) {
    const roleMatches = await Role.findAll({
      attributes: ["id"],
      where: {
        name: {
          [Op.like]: `%${search}%`,
        },
      },
      raw: true,
    });

    const matchedRoleIds = roleMatches
      .map((role) => Number(role.id))
      .filter((value) => Number.isFinite(value));

    whereClause[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      where(cast(col("users.id"), "CHAR"), { [Op.like]: `%${search}%` }),
      where(cast(col("users.role_id"), "CHAR"), { [Op.like]: `%${search}%` }),
      ...(matchedRoleIds.length > 0 ? [{ role_id: { [Op.in]: matchedRoleIds } }] : []),
    ];
  }

  if (idFilter) {
    andConditions.push(where(cast(col("users.id"), "CHAR"), { [Op.like]: `%${idFilter}%` }));
  }

  if (nameFilter) {
    andConditions.push({ name: { [Op.like]: `%${nameFilter}%` } });
  }

  if (emailFilter) {
    andConditions.push({ email: { [Op.like]: `%${emailFilter}%` } });
  }

  if (roleFilter) {
    const roleMatches = await Role.findAll({
      attributes: ["id"],
      where: {
        name: {
          [Op.like]: `%${roleFilter}%`,
        },
      },
      raw: true,
    });

    const matchedRoleIds = roleMatches
      .map((role) => Number(role.id))
      .filter((value) => Number.isFinite(value));

    if (matchedRoleIds.length === 0) {
      andConditions.push({ role_id: -1 });
    } else {
      andConditions.push({ role_id: { [Op.in]: matchedRoleIds } });
    }
  }

  if (companyFilter) {
    const companyConditions = [
      { legal_name: { [Op.like]: `%${companyFilter}%` } },
    ];

    if (companyIdFilter !== null) {
      companyConditions.push({ id: companyIdFilter });
    }

    companyInclude = {
      ...userCompanyInclude,
      required: true,
      where: {
        [Op.or]: companyConditions,
      },
    };
  }

  if (internoFilter !== null) {
    andConditions.push({ is_ldap: internoFilter ? 1 : 0 });
  }

  if (proveedorFilter !== null) {
    andConditions.push({
      is_ldap: proveedorFilter ? 0 : 1,
      mfa_enabled: proveedorFilter ? 1 : { [Op.in]: [0, false] },
    });
  }

  if (activoFilter !== null) {
    andConditions.push({ is_active: activoFilter ? 1 : 0 });
  }

  if (andConditions.length > 0) {
    whereClause[Op.and] = andConditions;
  }

  return {
    page,
    limit,
    offset,
    sortField,
    sortOrder,
    whereClause,
    companyInclude,
  };
};

const userListAttributes = [
  "id",
  "name",
  "role_id",
  "email",
  "status",
  "temporary_password",
  "email_verified_at",
  "password_reset_attempts",
  "last_failed_login",
  "is_ldap",
  "microsoft_payload",
  "mfa_enabled",
  "is_active",
];

const userDetailAttributes = [...userListAttributes];

const userCompanyInclude = {
  model: Company,
  as: "companies",
  attributes: ["id"],
  through: { attributes: [] },
  required: false,
};

const normalizeCompanyIds = (value) => {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((companyId) => Number(companyId))
      .filter((companyId) => Number.isInteger(companyId) && companyId > 0)
  )];
};

const serializeUser = (userInstance) => {
  const user = typeof userInstance?.toJSON === "function" ? userInstance.toJSON() : userInstance;
  const companies = Array.isArray(user?.companies) ? user.companies : [];

  return {
    id: user.id,
    name: user.name,
    role_id: user.role_id,
    email: user.email,
    status: user.status,
    temporary_password: user.temporary_password,
    email_verified_at: user.email_verified_at,
    password_reset_attempts: user.password_reset_attempts,
    last_failed_login: user.last_failed_login,
    is_ldap: user.is_ldap,
    microsoft_payload: user.microsoft_payload,
    mfa_enabled: user.mfa_enabled,
    is_active: user.is_active,
    companyIds: companies
      .map((company) => Number(company.id))
      .filter((companyId) => Number.isInteger(companyId) && companyId > 0),
  };
};

const buildAuditUserSummary = (user) => ({
  id: user?.id ?? null,
  name: user?.name ?? null,
  email: user?.email ?? null,
  role_id: user?.role_id ?? null,
  is_ldap: user?.is_ldap ?? null,
  mfa_enabled: user?.mfa_enabled ?? null,
  is_active: user?.is_active ?? null,
  companyIds: Array.isArray(user?.companyIds) ? user.companyIds : [],
});

const replaceUserCompanies = async (userId, companyIds, transaction) => {
  await UserCompany.destroy({
    where: { user_id: userId },
    transaction,
  });

  if (companyIds.length === 0) {
    return;
  }

  const companiesFound = await Company.findAll({
    where: { id: { [Op.in]: companyIds } },
    attributes: ["id"],
    transaction,
  });

  const foundIds = companiesFound
    .map((company) => Number(company.id))
    .filter((companyId) => Number.isInteger(companyId) && companyId > 0);

  if (foundIds.length !== companyIds.length) {
    throw new AppError("Una o más empresas no existen", 400);
  }

  await UserCompany.bulkCreate(
    foundIds.map((companyId) => ({
      user_id: userId,
      company_id: companyId,
    })),
    { transaction }
  );
};

const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortField, sortOrder, whereClause, companyInclude } = await getUserListQuery(
    req.query
  );

  const { count, rows } = await User.findAndCountAll({
    attributes: userListAttributes,
    include: [companyInclude],
    where: whereClause,
    order: [[sortField, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return res.status(200).json({
    code: rows.length > 0 ? 1 : -1,
    message: rows.length > 0 ? "Success" : "No Content",
    data: rows.map(serializeUser),
    meta: getPaginationMeta(page, limit, count),
  });
});

const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role_id,
    is_ldap = false,
    mfa_enabled = false,
    is_active = true,
  } = req.body;

  if (!name || !email || !password || !role_id) {
    throw new AppError("Faltan campos obligatorios", 400);
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = await User.findOne({ where: { email: normalizedEmail } });
  if (exists) {
    throw new AppError("El email ya está registrado", 409);
  }

  const role = await Role.findByPk(role_id, { attributes: ["id", "name"], raw: true });
  const providerUser = isProviderUserPayload({ role, is_ldap, mfa_enabled });
  const plainPassword = providerUser ? generateTemporaryPassword() : String(password);
  const password_hash = await bcrypt.hash(plainPassword, 10);
  const user = await User.create({
    name,
    email: normalizedEmail,
    password_hash,
    role_id,
    status: buildUserStatus(providerUser, is_active),
    temporary_password: providerUser,
    email_verified_at: providerUser ? null : new Date(),
    activation_token: providerUser ? crypto.randomUUID() : null,
    password_reset_attempts: 0,
    last_failed_login: null,
    is_ldap,
    mfa_enabled,
    is_active,
  });

  if (providerUser) {
    await sendProviderWelcomeEmail({
      email: normalizedEmail,
      temporaryPassword: plainPassword,
      loginUrl: buildProviderLoginUrl(),
    });
  }

  return res.status(201).json({
    code: 1,
    message: "Usuario creado",
    user: { id: user.id, name, email: normalizedEmail, role_id },
  });
});

const seedUser = asyncHandler(async (req, res) => {
  const { name, email, password, role_name, role_description } = req.body;

  if (!email || !password) {
    throw new AppError("Los campos email y password son obligatorios", 400);
  }

  const result = await seedDevAdmin(require("../models"), logger, {
    name,
    email,
    password,
    role_name,
    role_description,
    is_ldap: req.body.is_ldap,
    mfa_enabled: req.body.mfa_enabled,
    is_active: req.body.is_active,
  });

  if (!result.executed) {
    throw new AppError(
      "El seeder solo se puede ejecutar en entornos de desarrollo/local",
      403
    );
  }

  return res.status(result.created ? 201 : 200).json({
    code: 1,
    message: result.created
      ? "Usuario sembrado correctamente"
      : "Usuario actualizado correctamente por seeder",
    data: result,
  });
});

const getUser = async (req, res) => {
  const { id } = req.params;
  try {
    const data = await User.findOne({
      where: { id },
      attributes: userDetailAttributes,
      include: [userCompanyInclude],
      paranoid: false,
    });

    if (!data) {
      return res.status(404).json({
        code: -1,
        message: "Usuario no encontrado",
        data: {},
      });
    }

    return res.status(200).json({ code: 1, message: "Success", data: serializeUser(data) });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "users",
        context: "getUser",
        message: err.message,
        stack: err.stack,
        fullmessage: err,
        timestamp: new Date().toISOString(),
      })
    );
    return res.status(500).json({ code: -1, message: "Internal Server Error", data: [] });
  }
};

const postUser = async (req, res) => {
  const { name, role_id, email, password_hash, is_ldap, mfa_enabled, is_active } = req.body;
  const companyIds = normalizeCompanyIds(req.body.companyIds);

  if (!name || !email || !role_id) {
    return res.status(400).json({
      code: -1,
      message: "Se requiere nombre, correo, y rol.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new AppError("El email ya está registrado", 409);
    }

    const role = await Role.findByPk(role_id, { attributes: ["id", "name"], raw: true });
    if (!role) {
      throw new AppError("El rol seleccionado no existe", 400);
    }

    const providerUser = isProviderUserPayload({
      role,
      is_ldap: Boolean(is_ldap),
      mfa_enabled: Boolean(mfa_enabled),
    });
    const plainTemporaryPassword = providerUser ? generateTemporaryPassword() : null;
    const resolvedPasswordHash = providerUser
      ? await bcrypt.hash(plainTemporaryPassword, 10)
      : password_hash || null;

    const newUser = await User.sequelize.transaction(async (transaction) => {
      const createdUser = await User.create(
        {
          name,
          role_id,
          email: normalizedEmail,
          password_hash: resolvedPasswordHash,
          status: buildUserStatus(providerUser, is_active),
          temporary_password: providerUser,
          email_verified_at: providerUser ? null : new Date(),
          activation_token: providerUser ? crypto.randomUUID() : null,
          password_reset_attempts: 0,
          last_failed_login: null,
          is_ldap,
          mfa_enabled,
          is_active,
        },
        { transaction }
      );

      await replaceUserCompanies(createdUser.id, companyIds, transaction);

      return User.findByPk(createdUser.id, {
        attributes: userListAttributes,
        include: [userCompanyInclude],
        transaction,
      });
    });

    if (providerUser) {
      await sendProviderWelcomeEmail({
        email: normalizedEmail,
        temporaryPassword: plainTemporaryPassword,
        loginUrl: buildProviderLoginUrl(),
      });
    }

    await auditUsers(req, {
      action: "create",
      targetId: newUser.id,
      entityName: newUser.name,
      after: buildAuditUserSummary(serializeUser(newUser)),
    });

    return res.status(200).json({
      code: 1,
      message: "Success",
      data: serializeUser(newUser),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "users",
        context: "postUser",
        message: error.message,
        stack: error.stack,
        fullmessage: error,
        timestamp: new Date().toISOString(),
      })
    );

    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return res.status(statusCode).json({
      code: -1,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      data: {},
    });
  }
};

const updatedUser = async (req, res) => {
  const { id } = req.params;
  const { name, role_id, email, password_hash, is_ldap, mfa_enabled, is_active } = req.body;
  const companyIds = req.body.companyIds === undefined
    ? null
    : normalizeCompanyIds(req.body.companyIds);

  try {
    const item = await User.findOne({ where: { id } });
    if (!item) {
      return res.status(404).json({ code: -1, message: "No encontrado", data: {} });
    }

    const previousUser = await User.findByPk(id, {
      attributes: userListAttributes,
      include: [userCompanyInclude],
    });

    const updates = Object.fromEntries(
      Object.entries({
        name,
        role_id,
        email: email === undefined ? undefined : String(email).trim().toLowerCase(),
        password_hash,
        is_ldap,
        mfa_enabled,
        is_active,
      }).filter(([, value]) => value !== undefined)
    );

    if (updates.is_active !== undefined && !item.temporary_password) {
      updates.status = updates.is_active ? "active" : "inactive";
    }

    await User.sequelize.transaction(async (transaction) => {
      await User.update(updates, { where: { id }, transaction });

      if (companyIds !== null) {
        await replaceUserCompanies(id, companyIds, transaction);
      }
    });

    const updatedService = await User.findByPk(id, {
      attributes: userListAttributes,
      include: [userCompanyInclude],
    });

    await auditUsers(req, {
      action: "update",
      targetId: id,
      entityName: updatedService.name,
      before: buildAuditUserSummary(serializeUser(previousUser)),
      after: buildAuditUserSummary(serializeUser(updatedService)),
    });

    return res.status(200).json({
      code: 1,
      message: "Success",
      data: serializeUser(updatedService),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "users",
        context: "updatedUser",
        message: error.message,
        stack: error.stack,
        fullmessage: error,
        timestamp: new Date().toISOString(),
      })
    );

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({ code: -1, message: "Validation Error" });
    }

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ code: -1, message: error.message });
    }

    return res.status(500).json({ code: -1, message: "Internal Server Error" });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const item = await User.findOne({ where: { id } });
    if (!item) {
      return res.status(404).json({ code: -1, message: "No encontrado", data: {} });
    }

    const deletedUser = await User.findByPk(id, {
      attributes: userListAttributes,
      include: [userCompanyInclude],
    });

    await User.destroy({ where: { id } });
    const updatedService = await User.findByPk(id);

    await auditUsers(req, {
      action: "delete",
      targetId: id,
      entityName: item.name,
      before: buildAuditUserSummary(serializeUser(deletedUser)),
    });

    return res.status(200).json({ code: 1, message: "Success", data: updatedService });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "users",
        context: "deleteUser",
        message: error.message,
        stack: error.stack,
        fullmessage: error,
        timestamp: new Date().toISOString(),
      })
    );

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({ code: -1, message: "Validation Error" });
    }

    return res.status(500).json({ code: -1, message: "Internal Server Error" });
  }
};

const hardDeleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({
    where: { id },
    paranoid: false,
  });

  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  await User.sequelize.transaction(async (transaction) => {
    await UserSession.destroy({
      where: { user_id: user.id },
      force: true,
      transaction,
    });

    await UserCompany.destroy({
      where: { user_id: user.id },
      force: true,
      transaction,
    });

    await PasswordResetToken.destroy({
      where: { email: user.email },
      force: true,
      transaction,
    });

    await user.destroy({
      force: true,
      transaction,
    });
  });

  await auditUsers(req, {
    action: "hard_delete",
    targetId: user.id,
    entityName: user.name,
    before: buildAuditUserSummary({
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      is_ldap: user.is_ldap,
      mfa_enabled: user.mfa_enabled,
      is_active: user.is_active,
      companyIds: [],
    }),
  });

  return res.status(200).json({
    code: 1,
    message: "Usuario eliminado definitivamente",
    data: {
      id: Number(user.id),
      email: user.email,
    },
  });
});

const restoreUser = async (req, res) => {
  const { id } = req.params;

  try {
    const item = await User.findOne({
      where: { id },
      paranoid: false,
    });

    if (!item) {
      return res.status(404).json({ code: -1, message: "No encontrado", data: {} });
    }

    await User.restore({ where: { id } });

    const updatedService = await User.findByPk(id);

    await auditUsers(req, {
      action: "restore",
      targetId: id,
      entityName: updatedService?.name || String(id),
      after: updatedService
        ? buildAuditUserSummary({
            id: updatedService.id,
            name: updatedService.name,
            email: updatedService.email,
            role_id: updatedService.role_id,
            is_ldap: updatedService.is_ldap,
            mfa_enabled: updatedService.mfa_enabled,
            is_active: updatedService.is_active,
            companyIds: [],
          })
        : null,
    });

    return res.status(200).json({ code: 1, message: "Success", data: updatedService });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "users",
        context: "restoreUser",
        message: error.message,
        stack: error.stack,
        fullmessage: error,
        timestamp: new Date().toISOString(),
      })
    );

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({ code: -1, message: "Validation Error" });
    }

    return res.status(500).json({ code: -1, message: "Internal Server Error" });
  }
};

const resetUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!password || String(password).trim().length < 6) {
    throw new AppError("La contraseña debe tener al menos 6 caracteres", 400);
  }

  const user = await User.findOne({ where: { id } });
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  if (user.is_ldap) {
    throw new AppError("No se puede resetear la contraseña de un usuario LDAP", 400);
  }

  const password_hash = await bcrypt.hash(String(password), 10);
  await user.update({
    password_hash,
    temporary_password: false,
    status: user.is_active ? "active" : "inactive",
    activation_token: null,
    email_verified_at: user.email_verified_at || new Date(),
    password_reset_attempts: 0,
    last_failed_login: null,
  });

  await auditUsers(req, {
    action: "reset_password",
    targetId: user.id,
    entityName: user.name,
    metadata: {
      target_user: buildAuditUserSummary({
        id: user.id,
        name: user.name,
        email: user.email,
        role_id: user.role_id,
        is_ldap: user.is_ldap,
        mfa_enabled: user.mfa_enabled,
        is_active: user.is_active,
        companyIds: [],
      }),
    },
  });

  return res.status(200).json({
    code: 1,
    message: "Contraseña actualizada correctamente",
    data: { id: user.id },
  });
});

const resetProviderPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ where: { id } });
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  if (user.is_ldap) {
    throw new AppError("No se puede reiniciar la contrasena de un usuario LDAP", 400);
  }

  const role = await Role.findByPk(user.role_id, {
    attributes: ["id", "name"],
    raw: true,
  });

  const providerUser = isProviderUserPayload({
    role,
    is_ldap: Boolean(user.is_ldap),
    mfa_enabled: Boolean(user.mfa_enabled),
  });

  if (!providerUser) {
    throw new AppError("Solo se puede reiniciar la contrasena de proveedores", 400);
  }

  const temporaryPassword = generateTemporaryPassword(8);
  const password_hash = await bcrypt.hash(String(temporaryPassword), 10);

  await User.sequelize.transaction(async (transaction) => {
    await User.update(
      {
        password_hash,
        temporary_password: true,
        status: "pending",
        activation_token: crypto.randomUUID(),
        password_reset_attempts: 0,
        last_failed_login: null,
      },
      {
        where: { id: user.id },
        transaction,
      }
    );

    await UserSession.update(
      { is_active: 0 },
      {
        where: {
          user_id: user.id,
          is_active: 1,
        },
        transaction,
      }
    );
  });

  await sendProviderPasswordResetEmail({
    to: user.email,
    name: user.name,
    temporaryPassword,
  });

  await auditUsers(req, {
    action: "reset_provider_password",
    targetId: user.id,
    entityName: user.name,
    metadata: {
      target_user: buildAuditUserSummary({
        id: user.id,
        name: user.name,
        email: user.email,
        role_id: user.role_id,
        is_ldap: user.is_ldap,
        mfa_enabled: user.mfa_enabled,
        is_active: user.is_active,
        companyIds: [],
      }),
    },
  });

  return res.status(200).json({
    message: "Contrasena reiniciada correctamente.",
  });
});

const getUsersDeleted = async (req, res) => {
  try {
    const { page, limit, offset, sortField, sortOrder, whereClause, companyInclude } = await getUserListQuery(
      req.query
    );

    const { count, rows } = await User.findAndCountAll({
      where: {
        deleted_at: {
          [Op.ne]: null,
        },
        ...whereClause,
      },
      attributes: userListAttributes,
      include: [companyInclude],
      paranoid: false,
      order: [[sortField, sortOrder]],
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      code: rows.length > 0 ? 1 : -1,
      message: rows.length > 0 ? "Success" : "No Content",
      data: rows.map(serializeUser),
      meta: getPaginationMeta(page, limit, count),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "users",
        context: "getUsersDeleted",
        message: err.message,
        stack: err.stack,
        fullmessage: err,
        timestamp: new Date().toISOString(),
      })
    );
    return res.status(500).json({ code: -1, message: "Internal Server Error", data: [] });
  }
};

module.exports = {
  getUsers,
  getUser,
  registerUser,
  seedUser,
  postUser,
  updatedUser,
  deleteUser,
  hardDeleteUser,
  restoreUser,
  resetUserPassword,
  resetProviderPassword,
  getUsersDeleted,
};

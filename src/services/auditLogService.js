const { audit_logs: AuditLog, users: User } = require("../models");

const ACTION_DESCRIPTIONS = {
  create: "Se creo",
  update: "Se actualizó",
  delete: "Se elimino",
  hard_delete: "Se elimino definitivamente",
  restore: "Se restauro",
  reset_password: "Se restablecio la contrasena de",
  reset_provider_password: "Se reinicio la contrasena del proveedor",
};

const resolveIpAddress = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
};

const sanitizeMetadata = (metadata) => {
  if (metadata == null) return null;
  if (typeof metadata !== "object") return metadata;

  const blockedKeys = new Set([
    "authorization",
    "Authorization",
    "bearer",
    "bearerToken",
    "createdBearerToken",
    "password",
    "password_hash",
    "new_password",
    "password_confirmation",
    "confirm_password",
    "temporary_password",
    "current_password",
    "token",
    "activation_token",
    "session_jwt_token",
    "session_mfa_token",
    "mfa_code",
    "mfa_code_hash",
  ]);

  if (Array.isArray(metadata)) {
    return metadata.map((item) => sanitizeMetadata(item));
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      blockedKeys.has(key) ? "[REDACTED]" : sanitizeMetadata(value),
    ])
  );
};

const resolveActor = async (req) => {
  const actorId = req.user?.id ? Number(req.user.id) : null;
  const actorEmail = req.user?.email ? String(req.user.email) : null;

  if (!actorId) {
    return {
      actor_user_id: null,
      actor_name: "Sistema",
      actor_email: actorEmail,
    };
  }

  const actor = await User.findByPk(actorId, {
    attributes: ["id", "name", "email"],
    paranoid: false,
    raw: true,
  });

  return {
    actor_user_id: actorId,
    actor_name: actor?.name || actorEmail || "Usuario",
    actor_email: actor?.email || actorEmail,
  };
};

const createAuditLog = async ({
  req,
  moduleKey,
  moduleName,
  action,
  targetType,
  targetId,
  description,
  metadata = null,
}) => {
  try {
    const actor = await resolveActor(req);

    await AuditLog.create({
      ...actor,
      module_key: moduleKey,
      module_name: moduleName,
      action,
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId),
      description,
      metadata: sanitizeMetadata(metadata),
      ip_address: resolveIpAddress(req),
      user_agent: req.headers["user-agent"] || null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        service: "audit_logs",
        context: "createAuditLog",
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      })
    );
  }
};

const buildAuditDescription = ({
  action,
  targetType,
  entityName,
  description,
}) => {
  if (description) return description;

  const actionLabel = ACTION_DESCRIPTIONS[action] || "Se ejecuto una accion sobre";
  const entityLabel = entityName || targetType || "registro";
  return `${actionLabel} ${entityLabel}`;
};

const buildAuditMetadata = ({
  before,
  after,
  metadata = null,
}) => {
  const baseMetadata = metadata && typeof metadata === "object" ? { ...metadata } : {};

  if (before !== undefined) {
    baseMetadata.before = before;
  }

  if (after !== undefined) {
    baseMetadata.after = after;
  }

  return Object.keys(baseMetadata).length > 0 ? baseMetadata : null;
};

const auditEntityChange = async ({
  req,
  moduleKey,
  moduleName,
  targetType,
  action,
  targetId,
  entityName = null,
  description,
  before,
  after,
  metadata = null,
}) => createAuditLog({
  req,
  moduleKey,
  moduleName,
  action,
  targetType,
  targetId,
  description: buildAuditDescription({
    action,
    targetType,
    entityName,
    description,
  }),
  metadata: buildAuditMetadata({
    before,
    after,
    metadata,
  }),
});

const createModuleAuditLogger = ({
  moduleKey,
  moduleName,
  targetType,
}) => async (req, payload) =>
  auditEntityChange({
    req,
    moduleKey,
    moduleName,
    targetType,
    ...payload,
  });

module.exports = {
  createAuditLog,
  auditEntityChange,
  createModuleAuditLogger,
};

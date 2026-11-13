const { Op } = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const { audit_logs: AuditLog } = require("../models");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeText = (value) => String(value ?? "").trim();

const getPaginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const buildDateBoundary = (value, endOfDay = false) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const date = new Date(`${normalized}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serializeAuditLog = (log) => ({
  id: Number(log.id),
  actor_user_id: log.actor_user_id == null ? null : Number(log.actor_user_id),
  actor_name: log.actor_name,
  actor_email: log.actor_email,
  module_key: log.module_key,
  module_name: log.module_name,
  action: log.action,
  target_type: log.target_type,
  target_id: log.target_id,
  description: log.description,
  metadata: log.metadata,
  ip_address: log.ip_address,
  user_agent: log.user_agent,
  created_at: log.created_at,
});

const getBitacora = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
  const requestedLimit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const offset = (page - 1) * limit;
  const search = normalizeText(req.query.search);
  const moduleFilter = normalizeText(req.query.module);
  const actionFilter = normalizeText(req.query.action);
  const userFilter = normalizeText(req.query.user);
  const dateFrom = buildDateBoundary(req.query.dateFrom, false);
  const dateTo = buildDateBoundary(req.query.dateTo, true);
  const where = {};

  if (search) {
    where[Op.or] = [
      { description: { [Op.like]: `%${search}%` } },
      { actor_name: { [Op.like]: `%${search}%` } },
      { actor_email: { [Op.like]: `%${search}%` } },
      { module_name: { [Op.like]: `%${search}%` } },
      { target_type: { [Op.like]: `%${search}%` } },
      { target_id: { [Op.like]: `%${search}%` } },
    ];
  }

  if (moduleFilter) {
    where.module_key = moduleFilter;
  }

  if (actionFilter) {
    where.action = actionFilter;
  }

  if (userFilter) {
    where[Op.and] = [
      ...(where[Op.and] || []),
      {
        [Op.or]: [
          { actor_name: { [Op.like]: `%${userFilter}%` } },
          { actor_email: { [Op.like]: `%${userFilter}%` } },
        ],
      },
    ];
  }

  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at[Op.gte] = dateFrom;
    if (dateTo) where.created_at[Op.lte] = dateTo;
  }

  const { count, rows } = await AuditLog.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  return res.status(200).json({
    code: rows.length > 0 ? 1 : -1,
    message: rows.length > 0 ? "Success" : "No Content",
    data: rows.map(serializeAuditLog),
    meta: getPaginationMeta(page, limit, count),
  });
});

module.exports = {
  getBitacora,
};

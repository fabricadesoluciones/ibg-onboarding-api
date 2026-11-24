const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models/connection");
const { roles: Role } = require("../models");
const fail = (res, message, status = 400) => res.status(status).json({ code: -1, message });
const parse = (rule) => ({ ...rule, person_types: typeof rule.person_types === "string" ? JSON.parse(rule.person_types) : rule.person_types });

const listDocumentRules = async (req, res, next) => { try {
  const rows = await sequelize.query("SELECT * FROM onboarding_document_rules WHERE active = 1 AND deleted_at IS NULL ORDER BY sort_order", { type: QueryTypes.SELECT });
  const scope = String(req.query.scope || ""); const personType = String(req.query.person_type || "");
  const filtered = rows.map(parse).filter((rule) => (!scope || rule.scope === "ambos" || rule.scope === scope) && (!personType || rule.person_types.includes(personType)));
  res.json({ code: 1, data: filtered });
} catch (error) { next(error); } };

const updateDocumentRules = async (req, res, next) => { try {
  if (req.user.portal_type !== "interno") return fail(res, "Esta operación requiere acceso interno.", 403);
  const rules = req.body?.rules; if (!Array.isArray(rules)) return fail(res, "rules debe ser un arreglo.");
  const roleNames = [...new Set(rules.map((rule) => String(rule.validator_role || "").trim()).filter(Boolean))];
  const existingRoles = await Role.findAll({ where: { name: roleNames }, attributes: ["name"], raw: true });
  const foundNames = new Set(existingRoles.map((role) => role.name));
  const unknownRoles = roleNames.filter((roleName) => !foundNames.has(roleName));
  if (unknownRoles.length) return fail(res, `Los siguientes roles validadores no existen: ${unknownRoles.join(", ")}.`);
  await sequelize.transaction(async (transaction) => { for (const rule of rules) await sequelize.query("UPDATE onboarding_document_rules SET required=?, multiple=?, validity=?, validator_role=?, updated_at=NOW() WHERE code=?", { replacements: [Boolean(rule.required), Boolean(rule.multiple), String(rule.validity), String(rule.validator_role), String(rule.code)], transaction }); });
  return listDocumentRules(req, res, next);
} catch (error) { next(error); } };
module.exports = { listDocumentRules, updateDocumentRules };

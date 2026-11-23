const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op } = require("sequelize");
const {
  provider_pre_registrations: PreRegistration,
  users: User,
  roles: Role,
} = require("../models");
const { sendProviderWelcomeEmail } = require("../services/providerWelcomeEmailService");

const fail = (res, message, status = 400) => res.status(status).json({ code: -1, message });
const text = (value) => String(value || "").trim();
const temporaryPassword = () => `IBG-${crypto.randomBytes(5).toString("base64url")}`;
const expiresInSevenDays = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const serialize = (item) => ({
  id: `PA-${item.id}`,
  numeric_id: item.id,
  legal_name: item.legal_name,
  tax_id: item.tax_id,
  email: item.email,
  scope: item.scope,
  status: item.status,
  company_code: item.company_code,
  sent_at: item.sent_at,
  expires_at: item.expires_at,
  created_at: item.created_at,
});

const listPreRegistrations = async (req, res, next) => {
  try {
    const companyCode = text(req.query.company_code);
    const search = text(req.query.search);
    const where = companyCode ? { company_code: companyCode } : {};
    if (search) where[Op.or] = ["legal_name", "tax_id", "email"].map((field) => ({ [field]: { [Op.like]: `%${search}%` } }));
    const rows = await PreRegistration.findAll({ where, order: [["created_at", "DESC"]] });
    return res.json({ code: 1, data: rows.map(serialize) });
  } catch (error) { next(error); }
};

const createPreRegistration = async (req, res, next) => {
  try {
    const legalName = text(req.body.legal_name);
    const taxId = text(req.body.tax_id).toUpperCase();
    const email = text(req.body.email).toLowerCase();
    const companyCode = text(req.body.company_code).toUpperCase();
    const scope = text(req.body.scope);
    const send = Boolean(req.body.send);
    if (!legalName || !taxId || !email || !companyCode || !["nacional", "internacional"].includes(scope)) return fail(res, "Razón social, RFC/TAX ID, correo, empresa y tipo son obligatorios.");
    const duplicate = await PreRegistration.findOne({ where: { company_code: companyCode, tax_id: taxId, status: { [Op.notIn]: ["cancelled", "expired"] } } });
    if (duplicate) return fail(res, `Ya existe la prealta PA-${duplicate.id} para este RFC/TAX ID.`, 409);
    const item = await PreRegistration.create({ legal_name: legalName, tax_id: taxId, email, company_code: companyCode, scope, status: "draft", invited_by_user_id: req.user.id });
    if (send) await sendInvitation(item);
    return res.status(201).json({ code: 1, message: send ? "Invitación enviada." : "Prealta guardada.", data: serialize(item) });
  } catch (error) { next(error); }
};

const sendInvitation = async (item) => {
  const existing = await User.findOne({ where: { email: item.email } });
  let provider = existing;
  const password = temporaryPassword();
  if (!provider) {
    const role = await Role.findOne({ where: { name: { [Op.like]: "%proveedor%" } }, order: [["id", "ASC"]] });
    if (!role) throw new Error("No existe un rol de proveedor configurado para enviar la invitación.");
    provider = await User.create({ name: item.legal_name, email: item.email, password_hash: await bcrypt.hash(password, 10), role_id: role.id, status: "pending", temporary_password: true, activation_token: crypto.randomUUID(), password_reset_attempts: 0, is_ldap: false, mfa_enabled: true, is_active: true });
  } else {
    await provider.update({ password_hash: await bcrypt.hash(password, 10), status: "pending", temporary_password: true, activation_token: crypto.randomUUID(), mfa_enabled: true, is_active: true });
  }
  await item.update({ provider_user_id: provider.id, status: "sent", sent_at: new Date(), expires_at: expiresInSevenDays(), cancelled_at: null });
  await sendProviderWelcomeEmail({ email: item.email, temporaryPassword: password, loginUrl: process.env.PROVIDER_PORTAL_URL || "http://localhost:8081/login" });
};

const sendPreRegistration = async (req, res, next) => {
  try {
    const item = await PreRegistration.findByPk(req.params.id);
    if (!item || item.status === "cancelled") return fail(res, "La prealta no existe o fue cancelada.", 404);
    await sendInvitation(item);
    return res.json({ code: 1, message: "Invitación enviada.", data: serialize(item) });
  } catch (error) { next(error); }
};

const cancelPreRegistration = async (req, res, next) => {
  try {
    const item = await PreRegistration.findByPk(req.params.id);
    if (!item) return fail(res, "La prealta no existe.", 404);
    await item.update({ status: "cancelled", cancelled_at: new Date() });
    return res.json({ code: 1, message: "Invitación cancelada.", data: serialize(item) });
  } catch (error) { next(error); }
};

module.exports = { listPreRegistrations, createPreRegistration, sendPreRegistration, cancelPreRegistration };

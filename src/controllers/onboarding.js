const path = require("path");
const { Op } = require("sequelize");
const {
  provider_onboarding_requests: OnboardingRequest,
  provider_onboarding_documents: OnboardingDocument,
  provider_bank_accounts: BankAccount,
  suppliers: Supplier,
  notifications: Notification,
  users: User,
  roles: Role,
} = require("../models");

const DOCUMENT_TYPES = new Set(["csf", "ine", "edocta", "opinion", "domicilio", "contrato", "anexo", "repse", "poder", "acta", "certmarca", "valrfc", "cuenta", "incorp", "taxcert", "bank"]);
const fail = (res, message, status = 400) => res.status(status).json({ code: -1, message });
const stringValue = (value) => String(value || "").trim();
const isTruthy = (value) => [true, "true", "1", 1].includes(value);
const today = () => new Date().toISOString().slice(0, 10);
const maskAccount = (value) => `****${String(value || "").slice(-4)}`;

const validatePayload = (payload) => {
  const scope = stringValue(payload.scope);
  const legalName = stringValue(payload.legalName);
  const taxId = stringValue(payload.rfc).toUpperCase();
  const personType = stringValue(payload.personType);
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const required = ["company", "legalName", "personType", "rfc", "legalRep", "street", "noExt", "zip", "colonia", "municipio", "state", "countryAddr", "description", "bank", "account", "clabe", "signName"];
  if (!["nacional", "internacional"].includes(scope)) return { error: "El tipo de proveedor no es válido." };
  const missing = required.filter((name) => !stringValue(payload[name]));
  if (missing.length) return { error: `Campos obligatorios faltantes: ${missing.join(", ")}.` };
  if (!["fisica", "moral", "gob"].includes(personType)) return { error: "El tipo de persona no es válido." };
  if (scope === "nacional" && payload.repse === "si" && !stringValue(payload.repseNum)) return { error: "El número REPSE es obligatorio cuando aplica." };
  if (payload.currency === "other" && !stringValue(payload.currencyOther)) return { error: "Especifica la moneda seleccionada como otra." };
  if (!contacts.length || contacts.some((contact) => !stringValue(contact.type) || !stringValue(contact.name) || !stringValue(contact.email) || !stringValue(contact.phone))) return { error: "Debes registrar al menos un contacto con tipo, nombre, correo y teléfono." };
  return { scope, legalName, taxId, personType, contacts };
};

const bankDataFromPayload = (payload) => ({
  bank_name: stringValue(payload.bank), bank_country: stringValue(payload.bankCountry) || null,
  branch: stringValue(payload.branch) || null, reference: stringValue(payload.reference) || null,
  account_number: stringValue(payload.account), clabe_iban: stringValue(payload.clabe),
});

const syncPrimaryBankAccount = async (request, payload) => {
  const next = bankDataFromPayload(payload);
  let account = await BankAccount.findOne({ where: { onboarding_request_id: request.id, is_primary: true } });
  if (!account) return BankAccount.create({ onboarding_request_id: request.id, ...next, is_primary: true, validation_status: "pending_validation" });
  const changed = ["bank_name", "bank_country", "branch", "reference", "account_number", "clabe_iban"].some((key) => String(account[key] || "") !== String(next[key] || ""));
  if (changed) {
    await account.update({
      ...next,
      validation_status: account.is_blocked ? "blocked" : "pending_validation",
      validated_at: null, validated_by_user_id: null,
      validation_reset_reason: "Datos bancarios modificados por el proveedor",
      validation_reset_at: new Date(),
    });
  }
  return account;
};

const getActiveContract = (requestId) => OnboardingDocument.findOne({
  where: {
    onboarding_request_id: requestId, document_type: "contrato", not_applicable: false, is_blocked: false,
    valid_from: { [Op.lte]: today() },
    [Op.or]: [{ is_indefinite: true }, { valid_until: { [Op.gte]: today() } }],
  },
  order: [["created_at", "DESC"]],
});

const getOwnedRequest = (requestId, userId) => OnboardingRequest.findOne({ where: { id: requestId, user_id: userId } });

const getCfoRoleIds = async () => {
  const configured = String(process.env.CFO_ROLE_IDS || "").split(",").map((id) => Number(id.trim())).filter(Number.isFinite);
  if (configured.length) return configured;
  const roles = await Role.findAll({ attributes: ["id", "name"], raw: true });
  return roles.filter((role) => /\b(cfo|director|finanzas|tesorer[ií]a|admin)\b/i.test(String(role.name))).map((role) => Number(role.id));
};

const requireCfo = async (req, res) => {
  const cfoRoleIds = await getCfoRoleIds();
  if (!cfoRoleIds.includes(Number(req.user.role_id))) {
    fail(res, "Esta operación requiere rol CFO, Finanzas, Director o Admin.", 403);
    return false;
  }
  return true;
};

const notifyCfoUsers = async ({ alertType, subject, message }) => {
  const cfoRoleIds = await getCfoRoleIds();
  const configuredUserIds = String(process.env.CFO_ALERT_USER_IDS || "").split(",").map((id) => Number(id.trim())).filter(Number.isFinite);
  const recipients = await User.findAll({
    where: { is_active: true, [Op.or]: [{ role_id: { [Op.in]: cfoRoleIds.length ? cfoRoleIds : [-1] } }, { id: { [Op.in]: configuredUserIds.length ? configuredUserIds : [-1] } }] },
    attributes: ["id"], raw: true,
  });
  if (recipients.length) await Notification.bulkCreate(recipients.map((user) => ({ user_id: user.id, alert_type: alertType, subject, message, is_sent: false })));
  return recipients.length;
};

const saveMyRequest = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const parsed = validatePayload(payload);
    if (parsed.error) return fail(res, parsed.error);
    const conflictingSupplier = await Supplier.findOne({ where: { tax_id: parsed.taxId } });
    if (conflictingSupplier && Number(conflictingSupplier.user_id) !== Number(req.user.id)) return fail(res, "El RFC/Tax ID ya está registrado por otro proveedor.", 409);
    let supplier = await Supplier.findOne({ where: { user_id: req.user.id } });
    const supplierData = { user_id: req.user.id, supplier_type: parsed.scope === "nacional" ? "National" : "Foreign", tax_id: parsed.taxId, legal_name: parsed.legalName, approval_status: "Pending" };
    if (supplier) await supplier.update(supplierData); else supplier = await Supplier.create(supplierData);
    const requestData = { user_id: req.user.id, supplier_id: supplier.id, scope: parsed.scope, request_type: payload.requestType === "cambio" ? "cambio" : "alta", person_type: parsed.personType, legal_name: parsed.legalName, tax_id: parsed.taxId, status: "documents_pending", form_data: { ...payload, rfc: parsed.taxId, contacts: undefined }, contacts: parsed.contacts.map(({ id, ...contact }) => contact) };
    const [request, created] = await OnboardingRequest.findOrCreate({ where: { user_id: req.user.id }, defaults: requestData });
    if (!created) await request.update(requestData);
    const bankAccount = await syncPrimaryBankAccount(request, payload);
    return res.status(created ? 201 : 200).json({ code: 1, message: "Solicitud de onboarding guardada correctamente.", data: { id: request.id, supplier_id: supplier.id, bank_account_id: bankAccount.id, status: request.status } });
  } catch (error) { next(error); }
};

const getMyRequest = async (req, res, next) => {
  try {
    const request = await OnboardingRequest.findOne({ where: { user_id: req.user.id }, include: [{ model: OnboardingDocument, as: "documents" }, { model: BankAccount, as: "bank_accounts" }], order: [["updated_at", "DESC"]] });
    if (!request) return fail(res, "No existe una solicitud de onboarding para este usuario.", 404);
    return res.json({ code: 1, message: "OK", data: request });
  } catch (error) { next(error); }
};

const saveDocument = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "La solicitud no existe o no pertenece al usuario autenticado.", 404);
    const documentType = stringValue(req.body.documentType);
    const notApplicable = isTruthy(req.body.notApplicable);
    const isIndefinite = isTruthy(req.body.isIndefinite);
    if (!DOCUMENT_TYPES.has(documentType)) return fail(res, "Tipo de documento no válido.");
    if (documentType === "anexo" && !notApplicable && !(await getActiveContract(request.id))) return fail(res, "No puedes cargar un anexo: se requiere un contrato vigente y no bloqueado.", 409);
    if (notApplicable && stringValue(req.body.notApplicableReason).length < 15) return fail(res, "La justificación de No aplica debe tener al menos 15 caracteres.");
    if (!notApplicable && !req.file) return fail(res, "Adjunta el archivo PDF en el campo document.");
    if (!notApplicable && req.file.mimetype !== "application/pdf") return fail(res, "Solo se permiten archivos PDF.");
    if (!notApplicable && !stringValue(req.body.validFrom)) return fail(res, "La fecha de inicio de vigencia es obligatoria.");
    if (!notApplicable && !isIndefinite && !stringValue(req.body.validUntil)) return fail(res, "La fecha de fin de vigencia o la marca indefinida es obligatoria.");
    if (stringValue(req.body.validUntil) && stringValue(req.body.validFrom) && req.body.validUntil < req.body.validFrom) return fail(res, "La vigencia final no puede ser anterior a la inicial.");
    const document = await OnboardingDocument.create({ onboarding_request_id: request.id, document_type: documentType, original_name: req.file?.originalname || null, file_path: req.file ? `/storage/onboarding/${path.basename(req.file.filename)}` : null, mime_type: req.file?.mimetype || null, file_size: req.file?.size || null, valid_from: notApplicable ? null : req.body.validFrom, valid_until: notApplicable || isIndefinite ? null : req.body.validUntil, is_indefinite: notApplicable ? false : isIndefinite, not_applicable: notApplicable, not_applicable_reason: notApplicable ? stringValue(req.body.notApplicableReason) : null });
    return res.status(201).json({ code: 1, message: "Documento guardado correctamente.", data: document });
  } catch (error) { next(error); }
};

const blockDocument = async (req, res, next) => {
  try {
    if (!(await requireCfo(req, res))) return;
    const document = await OnboardingDocument.findOne({ where: { id: req.params.documentId, onboarding_request_id: req.params.requestId } });
    const reason = stringValue(req.body.reason);
    if (!document) return fail(res, "Documento no encontrado.", 404);
    if (reason.length < 10) return fail(res, "Indica un motivo de bloqueo de al menos 10 caracteres.");
    await document.update({ is_blocked: true, blocked_reason: reason, blocked_at: new Date() });
    let blockedAnnexes = 0;
    if (document.document_type === "contrato") [blockedAnnexes] = await OnboardingDocument.update({ is_blocked: true, blocked_reason: `Contrato bloqueado: ${reason}`, blocked_at: new Date() }, { where: { onboarding_request_id: document.onboarding_request_id, document_type: "anexo", is_blocked: false } });
    return res.json({ code: 1, message: "Documento bloqueado.", data: { id: document.id, blocked_annexes: blockedAnnexes } });
  } catch (error) { next(error); }
};

const softDeleteDocument = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "La solicitud no existe o no pertenece al usuario autenticado.", 404);
    const document = await OnboardingDocument.findOne({ where: { id: req.params.documentId, onboarding_request_id: request.id } });
    if (!document) return fail(res, "Documento no encontrado.", 404);
    let blockedAnnexes = 0;
    if (document.document_type === "contrato") [blockedAnnexes] = await OnboardingDocument.update({ is_blocked: true, blocked_reason: "Contrato dado de baja lógicamente", blocked_at: new Date() }, { where: { onboarding_request_id: request.id, document_type: "anexo", is_blocked: false } });
    await document.destroy();
    return res.json({ code: 1, message: "Documento dado de baja lógicamente.", data: { id: document.id, blocked_annexes: blockedAnnexes } });
  } catch (error) { next(error); }
};

const updateBankAccount = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "La solicitud no existe o no pertenece al usuario autenticado.", 404);
    const account = await BankAccount.findOne({ where: { id: req.params.accountId, onboarding_request_id: request.id } });
    if (!account) return fail(res, "Cuenta bancaria no encontrada.", 404);
    const next = bankDataFromPayload(req.body || {});
    if (!next.bank_name || !next.account_number || !next.clabe_iban) return fail(res, "Banco, cuenta y CLABE/IBAN son obligatorios.");
    await account.update({ ...next, validation_status: account.is_blocked ? "blocked" : "pending_validation", validated_at: null, validated_by_user_id: null, validation_reset_reason: "Datos bancarios modificados por el proveedor", validation_reset_at: new Date() });
    return res.json({ code: 1, message: "Cuenta actualizada; su validación fue reiniciada.", data: account });
  } catch (error) { next(error); }
};

const listCfoBankAccounts = async (req, res, next) => {
  try {
    if (!(await requireCfo(req, res))) return;
    const status = stringValue(req.query.status);
    const accounts = await BankAccount.findAll({ where: status ? { validation_status: status } : {}, include: [{ model: OnboardingRequest, as: "onboarding_request", attributes: ["id", "legal_name", "tax_id", "supplier_id"] }], order: [["updated_at", "DESC"]] });
    return res.json({ code: 1, message: "OK", data: accounts });
  } catch (error) { next(error); }
};

const blockBankAccount = async (req, res, next) => {
  try {
    if (!(await requireCfo(req, res))) return;
    const account = await BankAccount.findByPk(req.params.accountId);
    const reason = stringValue(req.body.reason);
    if (!account) return fail(res, "Cuenta bancaria no encontrada.", 404);
    if (reason.length < 10) return fail(res, "Indica un motivo de bloqueo de al menos 10 caracteres.");
    await account.update({ is_blocked: true, validation_status: "blocked", blocked_reason: reason, blocked_at: new Date(), blocked_by_user_id: req.user.id });
    const alerts = await notifyCfoUsers({ alertType: "bank_account_blocked", subject: "Cuenta bancaria bloqueada", message: `La cuenta ${maskAccount(account.clabe_iban)} fue bloqueada. Motivo: ${reason}` });
    return res.json({ code: 1, message: "Cuenta bloqueada y alerta registrada.", data: { ...account.toJSON(), notified_users: alerts } });
  } catch (error) { next(error); }
};

const validateBankAccount = async (req, res, next) => {
  try {
    if (!(await requireCfo(req, res))) return;
    const account = await BankAccount.findByPk(req.params.accountId);
    if (!account) return fail(res, "Cuenta bancaria no encontrada.", 404);
    if (account.is_blocked) return fail(res, "Una cuenta bloqueada no puede validarse. Debe desbloquearse por el flujo autorizado.", 409);
    await account.update({ validation_status: "validated", validated_at: new Date(), validated_by_user_id: req.user.id, validation_reset_reason: null, validation_reset_at: null });
    return res.json({ code: 1, message: "Cuenta validada por CFO.", data: account });
  } catch (error) { next(error); }
};

const resetBankValidation = async (req, res, next) => {
  try {
    if (!(await requireCfo(req, res))) return;
    const account = await BankAccount.findByPk(req.params.accountId);
    const reason = stringValue(req.body.reason);
    if (!account) return fail(res, "Cuenta bancaria no encontrada.", 404);
    if (reason.length < 10) return fail(res, "Indica un motivo de reinicio de al menos 10 caracteres.");
    await account.update({ validation_status: account.is_blocked ? "blocked" : "pending_validation", validated_at: null, validated_by_user_id: null, validation_reset_reason: reason, validation_reset_at: new Date() });
    const alerts = await notifyCfoUsers({ alertType: "bank_validation_reset", subject: "Validación bancaria reiniciada", message: `La cuenta ${maskAccount(account.clabe_iban)} requiere una nueva validación. Motivo: ${reason}` });
    return res.json({ code: 1, message: "Validación bancaria reiniciada y alerta registrada.", data: { ...account.toJSON(), notified_users: alerts } });
  } catch (error) { next(error); }
};

module.exports = { saveMyRequest, getMyRequest, saveDocument, blockDocument, softDeleteDocument, updateBankAccount, listCfoBankAccounts, blockBankAccount, validateBankAccount, resetBankValidation };

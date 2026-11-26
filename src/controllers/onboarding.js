const path = require("path");
const { Op } = require("sequelize");
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models/connection");
const {
  provider_onboarding_requests: OnboardingRequest,
  provider_onboarding_documents: OnboardingDocument,
  provider_bank_accounts: BankAccount,
  suppliers: Supplier,
  notifications: Notification,
  users: User,
  roles: Role,
  provider_pre_registrations: PreRegistration,
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

const requiredDocumentTypes = async (request) => {
  const rules = await sequelize.query("SELECT code, person_types FROM onboarding_document_rules WHERE active=1 AND deleted_at IS NULL AND required=1 AND (scope='ambos' OR scope=?)", { replacements: [request.scope], type: QueryTypes.SELECT });
  const personType = request.scope === "internacional" ? "internacional" : request.person_type;
  return rules.filter((rule) => (typeof rule.person_types === "string" ? JSON.parse(rule.person_types) : rule.person_types || []).includes(personType)).map((rule) => rule.code);
};

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
    const existingRequest = await OnboardingRequest.findOne({ where: { user_id: req.user.id } });
    const invitation = await PreRegistration.findOne({ where: { provider_user_id: req.user.id, status: { [Op.in]: ["sent", "completed"] } }, order: [["created_at", "DESC"]] });
    const registeredScope = existingRequest?.scope || invitation?.scope;
    if (registeredScope && registeredScope !== parsed.scope) return fail(res, "El tipo de proveedor no coincide con el registrado en la invitación o solicitud.", 409);
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

const getRegistrationContext = async (req, res, next) => {
  try {
    const request = await OnboardingRequest.findOne({ where: { user_id: req.user.id }, order: [["updated_at", "DESC"]] });
    const invitation = await PreRegistration.findOne({ where: { provider_user_id: req.user.id, status: { [Op.in]: ["sent", "completed"] } }, order: [["created_at", "DESC"]] });
    return res.json({ code: 1, data: { scope: request?.scope || invitation?.scope || null, person_type: request?.person_type || null } });
  } catch (error) { next(error); }
};

const listOnboardingRequests = async (req, res, next) => {
  try {
    if (req.user.portal_type !== "interno") return fail(res, "Esta operación requiere acceso interno.", 403);
    const scope = stringValue(req.query.scope);
    const where = ["nacional", "internacional"].includes(scope) ? { scope } : {};
    const requests = await OnboardingRequest.findAll({
      where,
      include: [
        { model: OnboardingDocument, as: "documents" },
        { model: BankAccount, as: "bank_accounts" },
        { model: User, as: "user", attributes: ["id", "name", "email", "status"] },
      ],
      order: [["updated_at", "DESC"]],
    });
    return res.json({ code: 1, message: "OK", data: requests });
  } catch (error) { next(error); }
};

const getOnboardingRequest = async (req, res, next) => {
  try {
    if (req.user.portal_type !== "interno") return fail(res, "Esta operación requiere acceso interno.", 403);
    const request = await OnboardingRequest.findByPk(req.params.requestId, {
      include: [{ model: OnboardingDocument, as: "documents" }, { model: BankAccount, as: "bank_accounts" }, { model: User, as: "user", attributes: ["id", "name", "email", "status"] }],
    });
    if (!request) return fail(res, "Solicitud no encontrada.", 404);
    return res.json({ code: 1, message: "OK", data: request });
  } catch (error) { next(error); }
};

const updateOnboardingRequestInternal = async (req, res, next) => {
  try {
    if (req.user.portal_type !== "interno") return fail(res, "Esta operación requiere acceso interno.", 403);
    const request = await OnboardingRequest.findByPk(req.params.requestId);
    if (!request) return fail(res, "Solicitud no encontrada.", 404);
    const payload = req.body || {};
    const parsed = validatePayload({ ...payload, scope: request.scope });
    if (parsed.error) return fail(res, parsed.error);
    await request.update({ legal_name: parsed.legalName, tax_id: parsed.taxId, person_type: parsed.personType, request_type: payload.requestType === "cambio" ? "cambio" : "alta", form_data: { ...payload, scope: request.scope, rfc: parsed.taxId, contacts: undefined }, contacts: parsed.contacts.map(({ id, ...contact }) => contact) });
    await syncPrimaryBankAccount(request, payload);
    return res.json({ code: 1, message: "Solicitud actualizada correctamente.", data: { id: request.id, status: request.status } });
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

const saveDocumentsBatch = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "La solicitud no existe o no pertenece al usuario autenticado.", 404);
    let items;
    try { items = JSON.parse(req.body.documents_metadata || "[]"); } catch { return fail(res, "documents_metadata debe ser un JSON válido."); }
    if (!Array.isArray(items) || !items.length) return fail(res, "Incluye al menos un documento.");
    const files = req.files || [];
    const ordered = [...items].sort((a, b) => (a.documentType === "contrato" ? -1 : 0) - (b.documentType === "contrato" ? -1 : 0));
    const saved = [];
    for (const item of ordered) {
      const documentType = stringValue(item.documentType);
      const notApplicable = isTruthy(item.notApplicable);
      const isIndefinite = isTruthy(item.isIndefinite);
      const file = Number.isInteger(item.fileIndex) ? files[item.fileIndex] : null;
      if (!DOCUMENT_TYPES.has(documentType)) return fail(res, `Tipo de documento no válido: ${documentType}.`);
      if (documentType === "anexo" && !notApplicable && !(await getActiveContract(request.id))) return fail(res, "No puedes cargar un anexo: se requiere un contrato vigente y no bloqueado.", 409);
      if (notApplicable && stringValue(item.notApplicableReason).length < 15) return fail(res, `La justificación de No aplica para ${documentType} debe tener al menos 15 caracteres.`);
      if (!notApplicable && !file) return fail(res, `Adjunta el PDF para ${documentType}.`);
      if (!notApplicable && file.mimetype !== "application/pdf") return fail(res, `Solo se permiten archivos PDF (${documentType}).`);
      if (!notApplicable && !stringValue(item.validFrom)) return fail(res, `La fecha de inicio es obligatoria (${documentType}).`);
      if (!notApplicable && !isIndefinite && !stringValue(item.validUntil)) return fail(res, `La fecha final o vigencia indefinida es obligatoria (${documentType}).`);
      if (stringValue(item.validUntil) && stringValue(item.validFrom) && item.validUntil < item.validFrom) return fail(res, `La vigencia final no puede ser anterior a la inicial (${documentType}).`);
      saved.push(await OnboardingDocument.create({ onboarding_request_id: request.id, document_type: documentType, original_name: file?.originalname || null, file_path: file ? `/storage/onboarding/${path.basename(file.filename)}` : null, mime_type: file?.mimetype || null, file_size: file?.size || null, valid_from: notApplicable ? null : item.validFrom, valid_until: notApplicable || isIndefinite ? null : item.validUntil, is_indefinite: notApplicable ? false : isIndefinite, not_applicable: notApplicable, not_applicable_reason: notApplicable ? stringValue(item.notApplicableReason) : null }));
    }
    return res.status(201).json({ code: 1, message: "Documentos guardados correctamente.", data: saved });
  } catch (error) { next(error); }
};

const updateProviderDocument = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "Solicitud no encontrada.", 404);
    const code = stringValue(req.body.documentType);
    const rules = await sequelize.query("SELECT code, person_types, required, multiple FROM onboarding_document_rules WHERE code=? AND active=1 AND deleted_at IS NULL AND (scope='ambos' OR scope=?)", { replacements: [code, request.scope], type: QueryTypes.SELECT });
    const rule = rules[0];
    const personType = request.scope === "internacional" ? "internacional" : request.person_type;
    if (!rule || !(typeof rule.person_types === "string" ? JSON.parse(rule.person_types) : rule.person_types || []).includes(personType)) return fail(res, "El documento no corresponde a este proveedor.", 400);
    if (!req.file || req.file.mimetype !== "application/pdf") return fail(res, "Adjunta un archivo PDF.");
    const from = stringValue(req.body.validFrom);
    const until = stringValue(req.body.validUntil);
    const indefinite = isTruthy(req.body.isIndefinite);
    if (!from || (!indefinite && !until) || (until && until < from)) return fail(res, "Indica una vigencia válida.");
    if (code === "anexo" && !(await getActiveContract(request.id))) return fail(res, "Se requiere un contrato vigente y no bloqueado para cargar un anexo.", 409);
    const existingId = stringValue(req.body.replaceDocumentId);
    let existing = null;
    if (existingId) {
      existing = await OnboardingDocument.findOne({ where: { id: existingId, onboarding_request_id: request.id, document_type: code } });
      if (!existing) return fail(res, "El documento a reemplazar no existe.", 404);
      if (existing.is_blocked) return fail(res, "El documento está bloqueado; contacta al área responsable.", 409);
    }
    const bankDocument = ["edocta", "bank", "cuenta"].includes(code);
    if (bankDocument && await BankAccount.findOne({ where: { onboarding_request_id: request.id, is_blocked: true } })) return fail(res, "La cuenta bancaria está bloqueada; contacta al área responsable.", 409);
    const document = await sequelize.transaction(async (transaction) => {
      if (existing) await existing.destroy({ transaction });
      if (!Boolean(rule.multiple)) await OnboardingDocument.destroy({ where: { onboarding_request_id: request.id, document_type: code }, transaction });
      else await OnboardingDocument.destroy({ where: { onboarding_request_id: request.id, document_type: code, not_applicable: true }, transaction });
      const created = await OnboardingDocument.create({ onboarding_request_id: request.id, document_type: code, original_name: req.file.originalname, file_path: `/storage/onboarding/${path.basename(req.file.filename)}`, mime_type: req.file.mimetype, file_size: req.file.size, valid_from: from, valid_until: indefinite ? null : until, is_indefinite: indefinite, validation_status: "pending" }, { transaction });
      if (bankDocument) await BankAccount.update({ validation_status: "pending_validation", validated_at: null, validated_by_user_id: null, validation_reset_reason: "Documento bancario actualizado por el proveedor", validation_reset_at: new Date() }, { where: { onboarding_request_id: request.id, is_blocked: false }, transaction });
      return created;
    });
    if (bankDocument) {
      try { await notifyCfoUsers({ alertType: "bank_validation_reset", subject: "Documento bancario actualizado", message: `El proveedor ${request.legal_name} actualizó su documento bancario; requiere una nueva validación.` }); }
      catch (error) { console.error("No se pudo registrar la alerta bancaria:", error.message); }
    }
    return res.status(201).json({ code: 1, message: bankDocument ? "Documento guardado; la cuenta requiere una nueva validación." : "Documento guardado y pendiente de validación.", data: document });
  } catch (error) { next(error); }
};

const submitMyRequest = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "La solicitud no existe o no pertenece al usuario autenticado.", 404);

    const documents = await OnboardingDocument.findAll({
      where: { onboarding_request_id: request.id },
      attributes: ["document_type", "file_path", "not_applicable", "is_blocked"],
    });
    const missing = (await requiredDocumentTypes(request)).filter((documentType) => !documents.some((document) =>
      document.document_type === documentType &&
      !document.not_applicable &&
      !document.is_blocked &&
      Boolean(document.file_path)
    ));
    if (missing.length) {
      return fail(res, `Faltan documentos obligatorios: ${missing.join(", ")}.`, 409);
    }

    await request.update({ status: "submitted" });
    // El usuario proveedor sólo pasa a activo cuando entregó toda la prealta.
    await User.update({ status: "active" }, { where: { id: request.user_id } });
    return res.json({ code: 1, message: "Prealta enviada para revisión.", data: { id: request.id, status: request.status } });
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
    if (account.is_blocked) return fail(res, "La cuenta está bloqueada; contacta al área responsable.", 409);
    const next = bankDataFromPayload(req.body || {});
    if (!next.bank_name || !next.account_number || !next.clabe_iban) return fail(res, "Banco, cuenta y CLABE/IBAN son obligatorios.");
    if (request.scope === "nacional" && !/^\d{18}$/.test(next.clabe_iban)) return fail(res, "La CLABE debe tener 18 dígitos.");
    if (["bank_name", "bank_country", "branch", "reference", "account_number", "clabe_iban"].every((key) => String(account[key] || "") === String(next[key] || ""))) return res.json({ code: 1, message: "No hay cambios en los datos bancarios.", data: account, changed: false });
    await sequelize.transaction(async (transaction) => {
      await account.update({ ...next, validation_status: "pending_validation", validated_at: null, validated_by_user_id: null, validation_reset_reason: "Datos bancarios modificados por el proveedor", validation_reset_at: new Date() }, { transaction });
      const formData = typeof request.form_data === "string" ? JSON.parse(request.form_data) : request.form_data || {};
      await request.update({ form_data: { ...formData, bank: next.bank_name, account: next.account_number, clabe: next.clabe_iban, bankCountry: next.bank_country, branch: next.branch, reference: next.reference } }, { transaction });
    });
    return res.json({ code: 1, message: "Cuenta actualizada; su validación fue reiniciada.", data: account, changed: true });
  } catch (error) { next(error); }
};

const updateProviderContact = async (req, res, next) => {
  try {
    const request = await getOwnedRequest(req.params.requestId, req.user.id);
    if (!request) return fail(res, "La solicitud no existe o no pertenece al usuario autenticado.", 404);
    const contacts = Array.isArray(request.contacts) ? request.contacts : JSON.parse(request.contacts || "[]");
    const incoming = req.body?.contacts;
    if (!Array.isArray(incoming) || incoming.length !== contacts.length) return fail(res, "La lista de contactos cambió. Recarga el expediente.", 409);
    const updated = contacts.map((contact, index) => ({ ...contact, email: stringValue(incoming[index]?.email), phone: stringValue(incoming[index]?.phone) }));
    if (updated.some((contact) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email) || !/^[\d\s()+-]{8,20}$/.test(contact.phone))) return fail(res, "Verifica los correos y teléfonos de los contactos.");
    const address = req.body?.address || {};
    const keys = ["street", "noExt", "noInt", "colonia", "zip", "municipio", "state", "countryAddr"];
    const fields = Object.fromEntries(keys.map((key) => [key, stringValue(address[key])]));
    if (keys.filter((key) => key !== "noInt").some((key) => !fields[key])) return fail(res, "Completa los campos del domicilio fiscal.");
    if (request.scope === "nacional" && !/^\d{5}$/.test(fields.zip)) return fail(res, "El código postal debe tener 5 dígitos.");
    const formData = typeof request.form_data === "string" ? JSON.parse(request.form_data) : request.form_data || {};
    await request.update({ contacts: updated, form_data: { ...formData, ...fields } });
    return res.json({ code: 1, message: "Contacto y domicilio actualizados.", data: { contacts: updated, form_data: request.form_data } });
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

module.exports = { saveMyRequest, getMyRequest, getRegistrationContext, listOnboardingRequests, getOnboardingRequest, updateOnboardingRequestInternal, saveDocument, saveDocumentsBatch, updateProviderDocument, submitMyRequest, blockDocument, softDeleteDocument, updateBankAccount, updateProviderContact, listCfoBankAccounts, blockBankAccount, validateBankAccount, resetBankValidation };

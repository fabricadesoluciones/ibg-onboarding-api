const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models/connection");
const {
  provider_onboarding_requests: OnboardingRequest,
  provider_onboarding_documents: OnboardingDocument,
  users: User,
  roles: Role,
} = require("../models");

const fail = (res, message, status = 400) => res.status(status).json({ code: -1, message });
const parseTypes = (value) => (typeof value === "string" ? JSON.parse(value) : value || []);
const toPlain = (model) => (model?.toJSON ? model.toJSON() : model);

const requireInternal = (req, res) => {
  if (req.user.portal_type === "interno") return true;
  fail(res, "Esta operación requiere acceso interno.", 403);
  return false;
};

const getActorRole = async (userId) => {
  const user = await User.findByPk(userId, { attributes: ["id", "role_id"] });
  if (!user?.role_id) return null;
  return Role.findByPk(user.role_id, { attributes: ["id", "name"] });
};

const rulesFor = async (request) => {
  const rules = await sequelize.query(
    "SELECT code, name, person_types, required, multiple, validity, validator_role, parent_code, is_contract, sort_order FROM onboarding_document_rules WHERE active=1 AND deleted_at IS NULL AND (scope='ambos' OR scope=?) ORDER BY sort_order",
    { replacements: [request.scope], type: QueryTypes.SELECT },
  );
  const personType = request.scope === "internacional" ? "internacional" : request.person_type;
  return rules.filter((rule) => parseTypes(rule.person_types).includes(personType));
};

const serializeRequest = (request) => {
  const plain = toPlain(request);
  return {
    id: Number(plain.id), legal_name: plain.legal_name, tax_id: plain.tax_id,
    scope: plain.scope, person_type: plain.person_type, status: plain.status,
    updated_at: plain.updated_at, user: plain.user ? { id: Number(plain.user.id), name: plain.user.name, email: plain.user.email } : null,
  };
};

const listDocumentValidationRequests = async (req, res, next) => {
  try {
    if (!requireInternal(req, res)) return;
    const search = String(req.query.search || "").trim();
    const where = search ? {
      [require("sequelize").Op.or]: [
        { legal_name: { [require("sequelize").Op.like]: `%${search}%` } },
        { tax_id: { [require("sequelize").Op.like]: `%${search}%` } },
      ],
    } : {};
    const requests = await OnboardingRequest.findAll({
      where,
      include: [{ model: OnboardingDocument, as: "documents", attributes: ["id", "validation_status", "is_blocked"] }, { model: User, as: "user", attributes: ["id", "name", "email"] }],
      order: [["updated_at", "DESC"]],
    });
    const data = requests.map((request) => {
      const item = serializeRequest(request);
      const documents = request.documents || [];
      return { ...item, documents_total: documents.length, documents_approved: documents.filter((doc) => doc.validation_status === "approved").length, documents_rejected: documents.filter((doc) => doc.validation_status === "rejected" || doc.is_blocked).length };
    });
    res.json({ code: 1, data });
  } catch (error) { next(error); }
};

const getDocumentValidation = async (req, res, next) => {
  try {
    if (!requireInternal(req, res)) return;
    const [request, actorRole] = await Promise.all([
      OnboardingRequest.findByPk(req.params.requestId, { include: [{ model: OnboardingDocument, as: "documents", paranoid: false }, { model: User, as: "user", attributes: ["id", "name", "email"] }] }),
      getActorRole(req.user.id),
    ]);
    if (!request) return fail(res, "Solicitud no encontrada.", 404);
    const rules = await rulesFor(request);
    const documents = request.documents || [];
    const validations = rules.map((rule) => ({
      ...rule,
      required: Boolean(rule.required), multiple: Boolean(rule.multiple), is_contract: Boolean(rule.is_contract),
      documents: documents.filter((document) => document.document_type === rule.code).map((document) => ({
        ...toPlain(document), id: Number(document.id), can_validate: actorRole?.name === rule.validator_role && !document.is_blocked && Boolean(document.file_path),
      })),
    }));
    res.json({ code: 1, data: { request: serializeRequest(request), actor_role: actorRole?.name || null, validations } });
  } catch (error) { next(error); }
};

const decideDocumentValidation = async (req, res, next) => {
  try {
    if (!requireInternal(req, res)) return;
    const decision = String(req.body?.decision || "").trim();
    const notes = String(req.body?.notes || "").trim();
    if (!["approved", "rejected"].includes(decision)) return fail(res, "La decisión debe ser approved o rejected.");
    if (decision === "rejected" && notes.length < 10) return fail(res, "Indica un motivo de rechazo de al menos 10 caracteres.");
    const document = await OnboardingDocument.findOne({ where: { id: req.params.documentId, onboarding_request_id: req.params.requestId } });
    if (!document) return fail(res, "Documento no encontrado.", 404);
    if (!document.file_path || document.not_applicable) return fail(res, "El documento no está disponible para validación.", 409);
    if (document.is_blocked) return fail(res, "El documento está bloqueado y no puede validarse.", 409);
    const [request, actorRole] = await Promise.all([OnboardingRequest.findByPk(req.params.requestId), getActorRole(req.user.id)]);
    if (!request || !actorRole) return fail(res, "No fue posible identificar el rol validador.", 403);
    const rule = (await rulesFor(request)).find((item) => item.code === document.document_type);
    if (!rule) return fail(res, "No hay una regla de validación activa para este documento.", 409);
    if (actorRole.name !== rule.validator_role) return fail(res, `Este documento debe ser validado por el rol ${rule.validator_role}.`, 403);
    await document.update({ validation_status: decision, validation_notes: notes || null, validated_by_user_id: req.user.id, validated_at: new Date() });
    const reviewer = await User.findByPk(req.user.id, { attributes: ["id", "name", "email"] });
    res.json({ code: 1, message: decision === "approved" ? "Documento aprobado." : "Documento rechazado.", data: { ...toPlain(document), reviewer } });
  } catch (error) { next(error); }
};

module.exports = { listDocumentValidationRequests, getDocumentValidation, decideDocumentValidation };

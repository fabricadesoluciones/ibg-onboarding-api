const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { companies: Company } = require("../models");
const { Op } = require("sequelize");
const { createModuleAuditLogger } = require("../services/auditLogService");

const auditCompanies = createModuleAuditLogger({
  moduleKey: "internal_company_catalog",
  moduleName: "Empresas",
  targetType: "company",
});

const serializeCompany = (company) => ({
  id: Number(company.id),
  tax_id: company.tax_id,
  legal_name: company.legal_name,
  description: company.description,
  is_active: company.is_active,
});

const getCompanies = asyncHandler(async (_req, res) => {
  const companies = await Company.findAll({
    attributes: ["id", "tax_id", "legal_name", "description", "is_active"],
    where: { is_active: true },
    order: [["legal_name", "ASC"]],
  });

  return res.status(200).json({
    code: companies.length > 0 ? 1 : -1,
    message: companies.length > 0 ? "Success" : "No Content",
    data: companies.map((company) => ({
      id: Number(company.id),
      name: company.legal_name,
      rfc: company.tax_id,
      description: company.description,
      is_active: company.is_active,
    })),
  });
});

const createCompany = asyncHandler(async (req, res) => {
  const {
    tax_id,
    legal_name,
    description = null,
    is_active = true,
  } = req.body || {};

  if (!tax_id || !legal_name) {
    throw new AppError("Los campos tax_id y legal_name son obligatorios", 400);
  }

  const normalizedTaxId = String(tax_id).trim().toUpperCase();
  const normalizedLegalName = String(legal_name).trim();
  const normalizedDescription =
    description === null || description === undefined || String(description).trim() === ""
      ? null
      : String(description).trim();

  const existingCompany = await Company.findOne({
    where: { tax_id: normalizedTaxId },
  });

  if (existingCompany) {
    throw new AppError("Ya existe una empresa con ese tax_id", 409);
  }

  const company = await Company.create({
    tax_id: normalizedTaxId,
    legal_name: normalizedLegalName,
    description: normalizedDescription,
    is_active,
  });

  await auditCompanies(req, {
    action: "create",
    targetId: company.id,
    entityName: company.legal_name,
    after: serializeCompany(company),
  });

  return res.status(201).json({
    code: 1,
    message: "Empresa creada correctamente",
    data: serializeCompany(company),
  });
});

const updateCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    tax_id,
    legal_name,
    description,
    is_active,
  } = req.body || {};

  const company = await Company.findByPk(id);
  if (!company) {
    throw new AppError("Empresa no encontrada", 404);
  }

  const previousCompany = serializeCompany(company);

  const updates = {};

  if (tax_id !== undefined) {
    const normalizedTaxId = String(tax_id).trim().toUpperCase();
    if (!normalizedTaxId) {
      throw new AppError("El campo tax_id no puede estar vacío", 400);
    }

    const existingCompany = await Company.findOne({
      where: {
        tax_id: normalizedTaxId,
        id: { [Op.ne]: id },
      },
    });

    if (existingCompany) {
      throw new AppError("Ya existe una empresa con ese tax_id", 409);
    }

    updates.tax_id = normalizedTaxId;
  }

  if (legal_name !== undefined) {
    const normalizedLegalName = String(legal_name).trim();
    if (!normalizedLegalName) {
      throw new AppError("El campo legal_name no puede estar vacío", 400);
    }
    updates.legal_name = normalizedLegalName;
  }

  if (description !== undefined) {
    updates.description =
      description === null || String(description).trim() === ""
        ? null
        : String(description).trim();
  }

  if (is_active !== undefined) {
    updates.is_active = is_active;
  }

  await company.update(updates);

  await auditCompanies(req, {
    action: "update",
    targetId: company.id,
    entityName: company.legal_name,
    before: previousCompany,
    after: serializeCompany(company),
  });

  return res.status(200).json({
    code: 1,
    message: "Empresa actualizada correctamente",
    data: serializeCompany(company),
  });
});

const deleteCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const company = await Company.findByPk(id);
  if (!company) {
    throw new AppError("Empresa no encontrada", 404);
  }

  const deletedCompany = serializeCompany(company);

  await company.update({ is_active: false });
  await company.destroy();

  await auditCompanies(req, {
    action: "delete",
    targetId: company.id,
    entityName: company.legal_name,
    before: deletedCompany,
  });

  return res.status(200).json({
    code: 1,
    message: "Empresa eliminada correctamente",
    data: {
      id: Number(company.id),
    },
  });
});

module.exports = {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
};

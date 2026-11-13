const { Op } = require("sequelize");
const db = require("../models");
const { areas, departments, positions, roles, role_permissions, users } = db;
const { createModuleAuditLogger } = require("../services/auditLogService");

const AUDIT_MODULE_KEY = "internal_roles_permissions";
const AUDIT_MODULE_NAME = "Roles y Permisos";
const auditRoles = createModuleAuditLogger({
  moduleKey: AUDIT_MODULE_KEY,
  moduleName: AUDIT_MODULE_NAME,
  targetType: "role",
});

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const PROTECTED_ROLE_ID = 1;

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

const normalizePermissionInput = (permission) => {
  if (typeof permission === "number" || typeof permission === "string") {
    const permissionId = Number(permission);
    if (!Number.isFinite(permissionId)) return null;

    return {
      permission_id: permissionId,
      create_permission: false,
      update_permission: false,
      delete_permission: false,
      synchronize_permission: false,
      view_permission: true,
    };
  }

  if (!permission || typeof permission !== "object") {
    return null;
  }

  const permissionId = Number(permission.permission_id);
  if (!Number.isFinite(permissionId)) return null;

  return {
    permission_id: permissionId,
    create_permission: Boolean(permission.create_permission),
    update_permission: Boolean(permission.update_permission),
    delete_permission: Boolean(permission.delete_permission),
    synchronize_permission: Boolean(permission.synchronize_permission),
    view_permission:
      permission.view_permission === undefined
        ? true
        : Boolean(permission.view_permission),
  };
};

const normalizeRolePayload = (body = {}) => ({
  name: String(body.name ?? "").trim(),
  description: String(body.description ?? "").trim() || null,
  area_id: Number(body.area_id),
  department_id: Number(body.department_id),
  position_id: Number(body.position_id),
});

const buildRoleResponse = (roleInstance) => ({
  id: Number(roleInstance.id),
  name: roleInstance.name,
  description: roleInstance.description,
  area_id: Number(roleInstance.area_id),
  department_id: Number(roleInstance.department_id),
  position_id: Number(roleInstance.position_id),
  area_name: roleInstance.area?.name ?? null,
  department_name: roleInstance.department?.name ?? null,
  position_name: roleInstance.position?.name ?? null,
});

const buildRoleAuditSummary = (role, permissions = []) => ({
  id: role?.id ? Number(role.id) : null,
  name: role?.name ?? null,
  description: role?.description ?? null,
  area_id: role?.area_id ? Number(role.area_id) : null,
  department_id: role?.department_id ? Number(role.department_id) : null,
  position_id: role?.position_id ? Number(role.position_id) : null,
  area_name: role?.area?.name ?? null,
  department_name: role?.department?.name ?? null,
  position_name: role?.position?.name ?? null,
  permissions,
});

const getRolePermissionsSummary = async (roleId, transaction) => {
  const records = await role_permissions.findAll({
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
    transaction,
  });

  return records.map((permission) => ({
    permission_id: Number(permission.permission_id),
    create_permission: Boolean(permission.create_permission),
    update_permission: Boolean(permission.update_permission),
    delete_permission: Boolean(permission.delete_permission),
    synchronize_permission: Boolean(permission.synchronize_permission),
    view_permission: Boolean(permission.view_permission),
  }));
};

const validateRoleScope = async (payload, currentRoleId = null, transaction) => {
  if (!payload.name) {
    const error = new Error("El nombre del rol es obligatorio.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(payload.area_id) || payload.area_id <= 0) {
    const error = new Error("El área es obligatoria.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(payload.department_id) || payload.department_id <= 0) {
    const error = new Error("El departamento es obligatorio.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(payload.position_id) || payload.position_id <= 0) {
    const error = new Error("El puesto es obligatorio.");
    error.statusCode = 400;
    throw error;
  }

  const [area, department, position] = await Promise.all([
    areas.findByPk(payload.area_id, { transaction }),
    departments.findByPk(payload.department_id, { transaction }),
    positions.findByPk(payload.position_id, { transaction }),
  ]);

  if (!area) {
    const error = new Error("El área seleccionada no existe.");
    error.statusCode = 400;
    throw error;
  }

  if (!department) {
    const error = new Error("El departamento seleccionado no existe.");
    error.statusCode = 400;
    throw error;
  }

  if (!position) {
    const error = new Error("El puesto seleccionado no existe.");
    error.statusCode = 400;
    throw error;
  }

  if (Number(department.area_id) !== payload.area_id) {
    const error = new Error("El departamento seleccionado no pertenece al área indicada.");
    error.statusCode = 400;
    throw error;
  }

  if (
    Number(position.area_id) !== payload.area_id ||
    Number(position.department_id) !== payload.department_id
  ) {
    const error = new Error("El puesto seleccionado no pertenece al área y departamento indicados.");
    error.statusCode = 400;
    throw error;
  }

  const duplicateRole = await roles.findOne({
    where: {
      name: payload.name,
      area_id: payload.area_id,
      department_id: payload.department_id,
      position_id: payload.position_id,
      ...(currentRoleId ? { id: { [Op.ne]: currentRoleId } } : {}),
    },
    paranoid: false,
    transaction,
  });

  if (duplicateRole) {
    const error = new Error(
      "Ya existe un rol guardado con la misma combinación exacta de Área + Departamento + Puesto + Nombre del Rol."
    );
    error.statusCode = 400;
    throw error;
  }
};

const getRoles = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
    const requestedLimit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const search = String(req.query.search ?? "").trim();
    const sortOrder = String(req.query.sortOrder ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

    const whereClause = search
      ? {
          [Op.or]: [
            { name: { [Op.like]: `%${search}%` } },
            { description: { [Op.like]: `%${search}%` } },
          ],
        }
      : undefined;

    const { count, rows } = await roles.findAndCountAll({
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
      where: whereClause,
      order: [["name", sortOrder]],
      limit,
      offset,
    });

    res.status(200).json({
      code: rows.length > 0 ? 1 : -1,
      message: rows.length > 0 ? "Success" : "No Content",
      data: rows.map(buildRoleResponse),
      meta: getPaginationMeta(page, limit, count),
    });
  } catch (error) {
    console.error("Error en getRoles:", error);
    res.status(500).json({ code: -1, error: error.message });
  }
};

const getDeletedRoles = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
    const requestedLimit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const search = String(req.query.search ?? "").trim();
    const sortOrder = String(req.query.sortOrder ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const whereClause = {
      deleted_at: { [Op.ne]: null },
      ...(search
        ? {
            [Op.or]: [
              { name: { [Op.like]: `%${search}%` } },
              { description: { [Op.like]: `%${search}%` } },
            ],
          }
        : {}),
    };

    const { count, rows } = await roles.findAndCountAll({
      attributes: [
        "id",
        "name",
        "description",
        "area_id",
        "department_id",
        "position_id",
        "deleted_at",
        "created_at",
        "updated_at",
      ],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
      where: whereClause,
      paranoid: false,
      order: [["deleted_at", sortOrder], ["name", "ASC"]],
      limit,
      offset,
    });

    res.status(200).json({
      code: rows.length > 0 ? 1 : -1,
      message: rows.length > 0 ? "Success" : "No deleted roles found",
      data: rows.map(buildRoleResponse),
      meta: getPaginationMeta(page, limit, count),
    });
  } catch (error) {
    console.error("Error en getDeletedRoles:", error);
    res.status(500).json({ code: -1, error: error.message });
  }
};

const getDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await roles.findByPk(id, {
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
    });

    if (!role) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    const permisosFound = await role_permissions.findAll({
      where: { role_id: id },
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

    const permissionsArray = permisosFound.map((permission) => ({
      permission_id: Number(permission.permission_id),
      create_permission: Boolean(permission.create_permission),
      update_permission: Boolean(permission.update_permission),
      delete_permission: Boolean(permission.delete_permission),
      synchronize_permission: Boolean(permission.synchronize_permission),
      view_permission: Boolean(permission.view_permission),
    }));

    res.status(200).json({
      code: 1,
      data: {
        ...buildRoleResponse(role),
        permissions: permissionsArray,
      },
    });
  } catch (error) {
    console.error("Error en getDetail:", error);
    res.status(500).json({ code: -1, error: error.message });
  }
};

const create = async (req, res) => {
  const t = await roles.sequelize.transaction();

  try {
    const { permissions } = req.body;
    const payload = normalizeRolePayload(req.body);

    await validateRoleScope(payload, null, t);

    const newRole = await roles.create(
      {
        name: payload.name,
        description: payload.description,
        area_id: payload.area_id,
        department_id: payload.department_id,
        position_id: payload.position_id,
      },
      { transaction: t }
    );

    if (permissions && permissions.length > 0) {
      const bulkData = permissions
        .map(normalizePermissionInput)
        .filter(Boolean)
        .map((permission) => ({
          role_id: newRole.id,
          permission_id: permission.permission_id,
          create_permission: permission.create_permission,
          update_permission: permission.update_permission,
          delete_permission: permission.delete_permission,
          synchronize_permission: permission.synchronize_permission,
          view_permission: permission.view_permission,
        }));

      if (bulkData.length > 0) {
        await role_permissions.bulkCreate(bulkData, { transaction: t });
      }
    }

    const createdRole = await roles.findByPk(newRole.id, {
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
      transaction: t,
    });
    const createdPermissions = await getRolePermissionsSummary(newRole.id, t);

    await t.commit();

    await auditRoles(req, {
      action: "create",
      targetId: newRole.id,
      entityName: newRole.name,
      after: buildRoleAuditSummary(createdRole, createdPermissions),
    });

    res.status(201).json({ code: 1, message: "Guardado correctamente", id: newRole.id });
  } catch (error) {
    if (t) await t.rollback();

    if (error.statusCode) {
      return res.status(error.statusCode).json({ code: -1, message: error.message });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        code: -1,
        message:
          "Ya existe un rol guardado con la misma combinación exacta de Área + Departamento + Puesto + Nombre del Rol.",
        field: error.fields,
      });
    }

    res.status(500).json({ code: -1, error: error.message });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body;
  const payload = normalizeRolePayload(req.body);
  const t = await roles.sequelize.transaction();

  try {
    const role = await roles.findByPk(id, { transaction: t });
    if (!role) {
      await t.rollback();
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    const previousRole = await roles.findByPk(id, {
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
      transaction: t,
    });
    const previousPermissions = await getRolePermissionsSummary(id, t);

    await validateRoleScope(payload, Number(id), t);

    await role.update(
      {
        name: payload.name,
        description: payload.description,
        area_id: payload.area_id,
        department_id: payload.department_id,
        position_id: payload.position_id,
      },
      { transaction: t }
    );

    await role_permissions.destroy({
      where: { role_id: id },
      transaction: t,
    });

    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const newPermissions = permissions
        .map(normalizePermissionInput)
        .filter(Boolean)
        .map((permission) => ({
          role_id: id,
          permission_id: permission.permission_id,
          create_permission: permission.create_permission,
          update_permission: permission.update_permission,
          delete_permission: permission.delete_permission,
          synchronize_permission: permission.synchronize_permission,
          view_permission: permission.view_permission,
        }));

      if (newPermissions.length > 0) {
        await role_permissions.bulkCreate(newPermissions, { transaction: t });
      }
    }

    const updatedRole = await roles.findByPk(id, {
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
      transaction: t,
    });
    const updatedPermissions = await getRolePermissionsSummary(id, t);

    await t.commit();

    await auditRoles(req, {
      action: "update",
      targetId: id,
      entityName: updatedRole.name,
      before: buildRoleAuditSummary(previousRole, previousPermissions),
      after: buildRoleAuditSummary(updatedRole, updatedPermissions),
    });

    res.status(200).json({
      code: 1,
      message: "Rol actualizado correctamente",
      id: role.id,
    });
  } catch (error) {
    if (t) await t.rollback();

    if (error.statusCode) {
      return res.status(error.statusCode).json({ code: -1, message: error.message });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        code: -1,
        message:
          "Ya existe un rol guardado con la misma combinación exacta de Área + Departamento + Puesto + Nombre del Rol.",
      });
    }

    res.status(500).json({ code: -1, error: error.message });
  }
};

const remove = async (req, res) => {
  const t = await roles.sequelize.transaction();

  try {
    const { id } = req.params;
    const roleId = Number(id);

    if (roleId === PROTECTED_ROLE_ID) {
      await t.rollback();
      return res.status(400).json({ code: -1, message: "El rol administrador no se puede eliminar." });
    }

    const role = await roles.findByPk(roleId, {
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
      transaction: t,
    });
    if (!role) {
      await t.rollback();
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    const assignedUsersCount = await users.count({
      where: { role_id: roleId },
      transaction: t,
    });

    if (assignedUsersCount > 0) {
      await t.rollback();
      return res.status(400).json({
        code: -1,
        message: "No se puede eliminar el rol porque tiene usuarios asignados.",
      });
    }

    const rolePermissionsSummary = await getRolePermissionsSummary(roleId, t);
    await role.destroy({ transaction: t });
    await t.commit();

    await auditRoles(req, {
      action: "delete",
      targetId: roleId,
      entityName: role.name,
      before: buildRoleAuditSummary(role, rolePermissionsSummary),
    });

    res.status(200).json({
      code: 1,
      message: "Rol eliminado correctamente",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Error en delete:", error);
    res.status(500).json({ code: -1, error: error.message });
  }
};

const restore = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await roles.findByPk(id, { paranoid: false });

    if (!role) {
      return res.status(404).json({ message: "Rol no encontrado en la papelera" });
    }

    if (role.deletedAt === null) {
      return res.status(400).json({ message: "El rol no está eliminado" });
    }

    await role.restore();

    const restoredRole = await roles.findByPk(id, {
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: areas, as: "area", attributes: ["id", "name"] },
        { model: departments, as: "department", attributes: ["id", "name"] },
        { model: positions, as: "position", attributes: ["id", "name"] },
      ],
    });
    const restoredPermissions = await getRolePermissionsSummary(id);

    await auditRoles(req, {
      action: "restore",
      targetId: id,
      entityName: restoredRole?.name || String(id),
      after: buildRoleAuditSummary(restoredRole, restoredPermissions),
    });

    res.status(200).json({
      code: 1,
      message: "Rol restaurado con éxito",
      role: {
        id: role.id,
        name: role.name,
      },
    });
  } catch (error) {
    console.error("Error en restore:", error);
    res.status(500).json({ code: -1, error: error.message });
  }
};

module.exports = {
  create,
  getDeletedRoles,
  getRoles,
  getDetail,
  remove,
  restore,
  update,
};

const db = require("../models");
const { createModuleAuditLogger } = require("../services/auditLogService");

const {
  role_permissions: RolePermission,
  roles: Role,
} = db;

const auditRolePermissions = createModuleAuditLogger({
  moduleKey: "internal_role_permissions_assignment",
  moduleName: "Asignacion de Permisos por Rol",
  targetType: "role_permission",
});

const serializeRolePermission = (permission) => ({
  id: permission?.id ? Number(permission.id) : null,
  role_id: permission?.role_id ? Number(permission.role_id) : null,
  permission_id: permission?.permission_id ? Number(permission.permission_id) : null,
  create_permission: Boolean(permission?.create_permission),
  update_permission: Boolean(permission?.update_permission),
  delete_permission: Boolean(permission?.delete_permission),
  synchronize_permission: Boolean(permission?.synchronize_permission),
  view_permission: Boolean(permission?.view_permission),
});

const create = async (req, res) => {
  try {
    const {
      role_id,
      permission_id,
      create_permission = false,
      update_permission = false,
      delete_permission = false,
      synchronize_permission = false,
      view_permission = true,
    } = req.body || {};

    const normalizedRoleId = Number(role_id);
    const normalizedPermissionId = Number(permission_id);

    if (!Number.isFinite(normalizedRoleId) || !Number.isFinite(normalizedPermissionId)) {
      return res.status(400).json({
        code: -1,
        message: "role_id y permission_id son obligatorios y deben ser numéricos.",
      });
    }

    const role = await Role.findByPk(normalizedRoleId);
    if (!role) {
      return res.status(404).json({
        code: -1,
        message: "El rol no existe.",
      });
    }

    const existingPermission = await RolePermission.findOne({
      where: {
        role_id: normalizedRoleId,
        permission_id: normalizedPermissionId,
      },
    });

    if (existingPermission) {
      return res.status(409).json({
        code: -1,
        message: "Ese permiso ya está asignado al rol.",
      });
    }

    const created = await RolePermission.create({
      role_id: normalizedRoleId,
      permission_id: normalizedPermissionId,
      create_permission: Boolean(create_permission),
      update_permission: Boolean(update_permission),
      delete_permission: Boolean(delete_permission),
      synchronize_permission: Boolean(synchronize_permission),
      view_permission: Boolean(view_permission),
    });

    await auditRolePermissions(req, {
      action: "create",
      targetId: created.id,
      entityName: `rol ${role.name} permiso ${normalizedPermissionId}`,
      after: serializeRolePermission(created),
    });

    return res.status(201).json({
      code: 1,
      message: "Permiso asignado correctamente al rol.",
      data: {
        id: created.id,
        role_id: created.role_id,
        permission_id: created.permission_id,
        create_permission: Boolean(created.create_permission),
        update_permission: Boolean(created.update_permission),
        delete_permission: Boolean(created.delete_permission),
        synchronize_permission: Boolean(created.synchronize_permission),
        view_permission: Boolean(created.view_permission),
      },
    });
  } catch (error) {
    console.error("Error en rolePermissions.create:", error);
    return res.status(500).json({
      code: -1,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

const update = async (req, res) => {
  try {
    const {
      role_id,
      permission_id,
      create_permission = false,
      update_permission = false,
      delete_permission = false,
      synchronize_permission = false,
      view_permission = true,
    } = req.body || {};

    const normalizedRoleId = Number(role_id);
    const normalizedPermissionId = Number(permission_id);

    if (!Number.isFinite(normalizedRoleId) || !Number.isFinite(normalizedPermissionId)) {
      return res.status(400).json({
        code: -1,
        message: "role_id y permission_id son obligatorios y deben ser numéricos.",
      });
    }

    const existingPermission = await RolePermission.findOne({
      where: {
        role_id: normalizedRoleId,
        permission_id: normalizedPermissionId,
      },
    });

    if (!existingPermission) {
      return res.status(404).json({
        code: -1,
        message: "No existe una asignación para ese role_id y permission_id.",
      });
    }

    const previousPermission = serializeRolePermission(existingPermission);
    const role = await Role.findByPk(normalizedRoleId, { attributes: ["id", "name"] });

    await existingPermission.update({
      create_permission: Boolean(create_permission),
      update_permission: Boolean(update_permission),
      delete_permission: Boolean(delete_permission),
      synchronize_permission: Boolean(synchronize_permission),
      view_permission: Boolean(view_permission),
    });

    await auditRolePermissions(req, {
      action: "update",
      targetId: existingPermission.id,
      entityName: `rol ${role?.name || normalizedRoleId} permiso ${normalizedPermissionId}`,
      before: previousPermission,
      after: serializeRolePermission(existingPermission),
    });

    return res.status(200).json({
      code: 1,
      message: "Permiso actualizado correctamente.",
      data: {
        id: existingPermission.id,
        role_id: existingPermission.role_id,
        permission_id: existingPermission.permission_id,
        create_permission: Boolean(existingPermission.create_permission),
        update_permission: Boolean(existingPermission.update_permission),
        delete_permission: Boolean(existingPermission.delete_permission),
        synchronize_permission: Boolean(existingPermission.synchronize_permission),
        view_permission: Boolean(existingPermission.view_permission),
      },
    });
  } catch (error) {
    console.error("Error en rolePermissions.update:", error);
    return res.status(500).json({
      code: -1,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

const remove = async (req, res) => {
  try {
    const { role_id, permission_id } = req.body || {};

    const normalizedRoleId = Number(role_id);
    const normalizedPermissionId = Number(permission_id);

    if (!Number.isFinite(normalizedRoleId) || !Number.isFinite(normalizedPermissionId)) {
      return res.status(400).json({
        code: -1,
        message: "role_id y permission_id son obligatorios y deben ser numéricos.",
      });
    }

    const existingPermission = await RolePermission.findOne({
      where: {
        role_id: normalizedRoleId,
        permission_id: normalizedPermissionId,
      },
    });

    if (!existingPermission) {
      return res.status(404).json({
        code: -1,
        message: "No existe una asignación para ese role_id y permission_id.",
      });
    }

    const deletedPermission = serializeRolePermission(existingPermission);
    const role = await Role.findByPk(normalizedRoleId, { attributes: ["id", "name"] });

    await existingPermission.destroy();

    await auditRolePermissions(req, {
      action: "delete",
      targetId: existingPermission.id,
      entityName: `rol ${role?.name || normalizedRoleId} permiso ${normalizedPermissionId}`,
      before: deletedPermission,
    });

    return res.status(200).json({
      code: 1,
      message: "Permiso eliminado correctamente del rol.",
      data: {
        role_id: normalizedRoleId,
        permission_id: normalizedPermissionId,
      },
    });
  } catch (error) {
    console.error("Error en rolePermissions.remove:", error);
    return res.status(500).json({
      code: -1,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

module.exports = {
  create,
  update,
  remove,
};

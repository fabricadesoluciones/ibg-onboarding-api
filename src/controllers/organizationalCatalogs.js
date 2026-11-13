const { Op } = require("sequelize");
const db = require("../models");
const { createModuleAuditLogger } = require("../services/auditLogService");

const { areas, departments, positions, roles } = db;

const auditCatalogs = createModuleAuditLogger({
  moduleKey: "internal_organizational_catalogs",
  moduleName: "Catálogos Organizacionales",
  targetType: "catalog_item",
});

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeText = (value) => String(value ?? "").trim();

const parseCatalogPayload = (body = {}) => ({
  name: normalizeText(body.name),
  description: normalizeText(body.description) || null,
});

const serializeArea = (area) => ({
  id: area?.id ? Number(area.id) : null,
  name: area?.name ?? null,
  description: area?.description ?? null,
});

const serializeDepartment = (department) => ({
  id: department?.id ? Number(department.id) : null,
  area_id: department?.area_id ? Number(department.area_id) : null,
  name: department?.name ?? null,
  description: department?.description ?? null,
});

const serializePosition = (position) => ({
  id: position?.id ? Number(position.id) : null,
  area_id: position?.area_id ? Number(position.area_id) : null,
  department_id: position?.department_id ? Number(position.department_id) : null,
  name: position?.name ?? null,
  description: position?.description ?? null,
});

const isSoftDeleted = (item) => Boolean(item?.deleted_at || item?.deletedAt);

const ensureAreaExists = async (areaId) => {
  const area = await areas.findByPk(areaId);
  if (!area) {
    const error = new Error("Area no encontrada");
    error.statusCode = 404;
    throw error;
  }

  return area;
};

const ensureDepartmentExists = async (departmentId) => {
  const department = await departments.findByPk(departmentId);
  if (!department) {
    const error = new Error("Departamento no encontrado");
    error.statusCode = 404;
    throw error;
  }

  return department;
};

const ensurePositionExists = async (positionId) => {
  const position = await positions.findByPk(positionId);
  if (!position) {
    const error = new Error("Puesto no encontrado");
    error.statusCode = 404;
    throw error;
  }

  return position;
};

const handleError = (res, error, fallback) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    code: -1,
    message: error.message || fallback,
    error: error.message || fallback,
  });
};

const getSnapshot = async (req, res) => {
  try {
    const [areasList, departmentsList, positionsList] = await Promise.all([
      areas.findAll({
        attributes: ["id", "name", "description"],
        order: [["name", "ASC"]],
      }),
      departments.findAll({
        attributes: ["id", "name", "description", "area_id"],
        order: [["name", "ASC"]],
      }),
      positions.findAll({
        attributes: ["id", "name", "description", "area_id", "department_id"],
        order: [["name", "ASC"]],
      }),
    ]);

    res.status(200).json({
      code: 1,
      data: {
        areas: areasList,
        departments: departmentsList,
        positions: positionsList,
      },
    });
  } catch (error) {
    handleError(res, error, "No se pudieron cargar los catalogos");
  }
};

const listAreas = async (req, res) => {
  try {
    const search = normalizeText(req.query.search);
    const where = search
      ? {
          name: {
            [Op.like]: `%${search}%`,
          },
        }
      : undefined;

    const data = await areas.findAll({
      attributes: ["id", "name", "description"],
      where,
      order: [["name", "ASC"]],
    });

    res.status(200).json({ code: 1, data });
  } catch (error) {
    handleError(res, error, "No se pudieron cargar las areas");
  }
};

const createArea = async (req, res) => {
  try {
    const payload = parseCatalogPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ code: -1, message: "El nombre del area es obligatorio" });
    }

    const existing = await areas.findOne({
      where: { name: payload.name },
      paranoid: false,
    });

    if (existing) {
      if (isSoftDeleted(existing)) {
        await existing.restore();
        await existing.update(payload);

        await auditCatalogs(req, {
          action: "restore",
          targetId: existing.id,
          entityName: `area ${existing.name}`,
          after: serializeArea(existing),
          metadata: {
            catalog_type: "area",
            restored_via_create: true,
          },
        });

        return res.status(200).json({
          code: 1,
          message: "Area recuperada correctamente",
          data: existing,
        });
      }

      return res.status(400).json({ code: -1, message: "Ya existe un area con ese nombre" });
    }

    const created = await areas.create(payload);
    await auditCatalogs(req, {
      action: "create",
      targetId: created.id,
      entityName: `area ${created.name}`,
      after: serializeArea(created),
      metadata: { catalog_type: "area" },
    });
    res.status(201).json({ code: 1, message: "Area creada correctamente", data: created });
  } catch (error) {
    handleError(res, error, "No se pudo crear el area");
  }
};

const updateArea = async (req, res) => {
  try {
    const areaId = parseId(req.params.id);
    const payload = parseCatalogPayload(req.body);

    if (!areaId) {
      return res.status(400).json({ code: -1, message: "Area invalida" });
    }

    if (!payload.name) {
      return res.status(400).json({ code: -1, message: "El nombre del area es obligatorio" });
    }

    const area = await ensureAreaExists(areaId);
    const previousArea = serializeArea(area);

    const duplicate = await areas.findOne({
      where: {
        name: payload.name,
        id: { [Op.ne]: areaId },
      },
      paranoid: false,
    });

    if (duplicate) {
      return res.status(400).json({ code: -1, message: "Ya existe un area con ese nombre" });
    }

    await area.update(payload);
    await auditCatalogs(req, {
      action: "update",
      targetId: area.id,
      entityName: `area ${area.name}`,
      before: previousArea,
      after: serializeArea(area),
      metadata: { catalog_type: "area" },
    });
    res.status(200).json({ code: 1, message: "Area actualizada correctamente", data: area });
  } catch (error) {
    handleError(res, error, "No se pudo actualizar el area");
  }
};

const deleteArea = async (req, res) => {
  try {
    const areaId = parseId(req.params.id);
    if (!areaId) {
      return res.status(400).json({ code: -1, message: "Area invalida" });
    }

    const area = await ensureAreaExists(areaId);
    const deletedArea = serializeArea(area);
    const [departmentsCount, rolesCount] = await Promise.all([
      departments.count({ where: { area_id: areaId } }),
      roles.count({ where: { area_id: areaId } }),
    ]);

    if (departmentsCount > 0 || rolesCount > 0) {
      return res.status(400).json({
        code: -1,
        message: "No se puede eliminar el area porque tiene departamentos o roles relacionados",
      });
    }

    await area.destroy();
    await auditCatalogs(req, {
      action: "delete",
      targetId: area.id,
      entityName: `area ${area.name}`,
      before: deletedArea,
      metadata: { catalog_type: "area" },
    });
    res.status(200).json({ code: 1, message: "Area eliminada correctamente" });
  } catch (error) {
    handleError(res, error, "No se pudo eliminar el area");
  }
};

const listDepartments = async (req, res) => {
  try {
    const areaId = parseId(req.query.area_id);
    const search = normalizeText(req.query.search);
    const where = {
      ...(areaId ? { area_id: areaId } : {}),
      ...(search ? { name: { [Op.like]: `%${search}%` } } : {}),
    };

    const data = await departments.findAll({
      attributes: ["id", "name", "description", "area_id"],
      where,
      order: [["name", "ASC"]],
    });

    res.status(200).json({ code: 1, data });
  } catch (error) {
    handleError(res, error, "No se pudieron cargar los departamentos");
  }
};

const createDepartment = async (req, res) => {
  try {
    const areaId = parseId(req.body.area_id);
    const payload = parseCatalogPayload(req.body);

    if (!areaId) {
      return res.status(400).json({ code: -1, message: "El area es obligatoria" });
    }

    if (!payload.name) {
      return res.status(400).json({ code: -1, message: "El nombre del departamento es obligatorio" });
    }

    await ensureAreaExists(areaId);

    const existing = await departments.findOne({
      where: { area_id: areaId, name: payload.name },
      paranoid: false,
    });

    if (existing) {
      if (isSoftDeleted(existing)) {
        await existing.restore();
        await existing.update({
          area_id: areaId,
          ...payload,
        });

        await auditCatalogs(req, {
          action: "restore",
          targetId: existing.id,
          entityName: `departamento ${existing.name}`,
          after: serializeDepartment(existing),
          metadata: {
            catalog_type: "department",
            restored_via_create: true,
          },
        });

        return res.status(200).json({
          code: 1,
          message: "Departamento recuperado correctamente",
          data: existing,
        });
      }

      return res.status(400).json({
        code: -1,
        message: "Ya existe un departamento con ese nombre dentro del area seleccionada",
      });
    }

    const created = await departments.create({
      area_id: areaId,
      ...payload,
    });

    await auditCatalogs(req, {
      action: "create",
      targetId: created.id,
      entityName: `departamento ${created.name}`,
      after: serializeDepartment(created),
      metadata: { catalog_type: "department" },
    });

    res.status(201).json({ code: 1, message: "Departamento creado correctamente", data: created });
  } catch (error) {
    handleError(res, error, "No se pudo crear el departamento");
  }
};

const updateDepartment = async (req, res) => {
  try {
    const departmentId = parseId(req.params.id);
    const areaId = parseId(req.body.area_id);
    const payload = parseCatalogPayload(req.body);

    if (!departmentId) {
      return res.status(400).json({ code: -1, message: "Departamento invalido" });
    }

    if (!areaId) {
      return res.status(400).json({ code: -1, message: "El area es obligatoria" });
    }

    if (!payload.name) {
      return res.status(400).json({ code: -1, message: "El nombre del departamento es obligatorio" });
    }

    await ensureAreaExists(areaId);
    const department = await ensureDepartmentExists(departmentId);
    const previousDepartment = serializeDepartment(department);

    const duplicate = await departments.findOne({
      where: {
        area_id: areaId,
        name: payload.name,
        id: { [Op.ne]: departmentId },
      },
      paranoid: false,
    });

    if (duplicate) {
      return res.status(400).json({
        code: -1,
        message: "Ya existe un departamento con ese nombre dentro del area seleccionada",
      });
    }

    await department.update({
      area_id: areaId,
      ...payload,
    });

    await auditCatalogs(req, {
      action: "update",
      targetId: department.id,
      entityName: `departamento ${department.name}`,
      before: previousDepartment,
      after: serializeDepartment(department),
      metadata: { catalog_type: "department" },
    });

    res.status(200).json({
      code: 1,
      message: "Departamento actualizado correctamente",
      data: department,
    });
  } catch (error) {
    handleError(res, error, "No se pudo actualizar el departamento");
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const departmentId = parseId(req.params.id);
    if (!departmentId) {
      return res.status(400).json({ code: -1, message: "Departamento invalido" });
    }

    const department = await ensureDepartmentExists(departmentId);
    const deletedDepartment = serializeDepartment(department);
    const [positionsCount, rolesCount] = await Promise.all([
      positions.count({ where: { department_id: departmentId } }),
      roles.count({ where: { department_id: departmentId } }),
    ]);

    if (positionsCount > 0 || rolesCount > 0) {
      return res.status(400).json({
        code: -1,
        message: "No se puede eliminar el departamento porque tiene puestos o roles relacionados",
      });
    }

    await department.destroy();
    await auditCatalogs(req, {
      action: "delete",
      targetId: department.id,
      entityName: `departamento ${department.name}`,
      before: deletedDepartment,
      metadata: { catalog_type: "department" },
    });
    res.status(200).json({ code: 1, message: "Departamento eliminado correctamente" });
  } catch (error) {
    handleError(res, error, "No se pudo eliminar el departamento");
  }
};

const listPositions = async (req, res) => {
  try {
    const areaId = parseId(req.query.area_id);
    const departmentId = parseId(req.query.department_id);
    const search = normalizeText(req.query.search);
    const where = {
      ...(areaId ? { area_id: areaId } : {}),
      ...(departmentId ? { department_id: departmentId } : {}),
      ...(search ? { name: { [Op.like]: `%${search}%` } } : {}),
    };

    const data = await positions.findAll({
      attributes: ["id", "name", "description", "area_id", "department_id"],
      where,
      order: [["name", "ASC"]],
    });

    res.status(200).json({ code: 1, data });
  } catch (error) {
    handleError(res, error, "No se pudieron cargar los puestos");
  }
};

const createPosition = async (req, res) => {
  try {
    const areaId = parseId(req.body.area_id);
    const departmentId = parseId(req.body.department_id);
    const payload = parseCatalogPayload(req.body);

    if (!areaId) {
      return res.status(400).json({ code: -1, message: "El area es obligatoria" });
    }

    if (!departmentId) {
      return res.status(400).json({ code: -1, message: "El departamento es obligatorio" });
    }

    if (!payload.name) {
      return res.status(400).json({ code: -1, message: "El nombre del puesto es obligatorio" });
    }

    await ensureAreaExists(areaId);
    const department = await ensureDepartmentExists(departmentId);

    if (Number(department.area_id) !== areaId) {
      return res.status(400).json({
        code: -1,
        message: "El departamento seleccionado no pertenece al area indicada",
      });
    }

    const existing = await positions.findOne({
      where: { department_id: departmentId, name: payload.name },
      paranoid: false,
    });

    if (existing) {
      if (isSoftDeleted(existing)) {
        await existing.restore();
        await existing.update({
          area_id: areaId,
          department_id: departmentId,
          ...payload,
        });

        await auditCatalogs(req, {
          action: "restore",
          targetId: existing.id,
          entityName: `puesto ${existing.name}`,
          after: serializePosition(existing),
          metadata: {
            catalog_type: "position",
            restored_via_create: true,
          },
        });

        return res.status(200).json({
          code: 1,
          message: "Puesto recuperado correctamente",
          data: existing,
        });
      }

      return res.status(400).json({
        code: -1,
        message: "Ya existe un puesto con ese nombre dentro del departamento seleccionado",
      });
    }

    const created = await positions.create({
      area_id: areaId,
      department_id: departmentId,
      ...payload,
    });

    await auditCatalogs(req, {
      action: "create",
      targetId: created.id,
      entityName: `puesto ${created.name}`,
      after: serializePosition(created),
      metadata: { catalog_type: "position" },
    });

    res.status(201).json({ code: 1, message: "Puesto creado correctamente", data: created });
  } catch (error) {
    handleError(res, error, "No se pudo crear el puesto");
  }
};

const updatePosition = async (req, res) => {
  try {
    const positionId = parseId(req.params.id);
    const areaId = parseId(req.body.area_id);
    const departmentId = parseId(req.body.department_id);
    const payload = parseCatalogPayload(req.body);

    if (!positionId) {
      return res.status(400).json({ code: -1, message: "Puesto invalido" });
    }

    if (!areaId) {
      return res.status(400).json({ code: -1, message: "El area es obligatoria" });
    }

    if (!departmentId) {
      return res.status(400).json({ code: -1, message: "El departamento es obligatorio" });
    }

    if (!payload.name) {
      return res.status(400).json({ code: -1, message: "El nombre del puesto es obligatorio" });
    }

    await ensureAreaExists(areaId);
    const department = await ensureDepartmentExists(departmentId);
    const position = await ensurePositionExists(positionId);
    const previousPosition = serializePosition(position);

    if (Number(department.area_id) !== areaId) {
      return res.status(400).json({
        code: -1,
        message: "El departamento seleccionado no pertenece al area indicada",
      });
    }

    const duplicate = await positions.findOne({
      where: {
        department_id: departmentId,
        name: payload.name,
        id: { [Op.ne]: positionId },
      },
      paranoid: false,
    });

    if (duplicate) {
      return res.status(400).json({
        code: -1,
        message: "Ya existe un puesto con ese nombre dentro del departamento seleccionado",
      });
    }

    await position.update({
      area_id: areaId,
      department_id: departmentId,
      ...payload,
    });

    await auditCatalogs(req, {
      action: "update",
      targetId: position.id,
      entityName: `puesto ${position.name}`,
      before: previousPosition,
      after: serializePosition(position),
      metadata: { catalog_type: "position" },
    });

    res.status(200).json({ code: 1, message: "Puesto actualizado correctamente", data: position });
  } catch (error) {
    handleError(res, error, "No se pudo actualizar el puesto");
  }
};

const deletePosition = async (req, res) => {
  try {
    const positionId = parseId(req.params.id);
    if (!positionId) {
      return res.status(400).json({ code: -1, message: "Puesto invalido" });
    }

    const position = await ensurePositionExists(positionId);
    const deletedPosition = serializePosition(position);
    const rolesCount = await roles.count({ where: { position_id: positionId } });

    if (rolesCount > 0) {
      return res.status(400).json({
        code: -1,
        message: "No se puede eliminar el puesto porque tiene roles relacionados",
      });
    }

    await position.destroy();
    await auditCatalogs(req, {
      action: "delete",
      targetId: position.id,
      entityName: `puesto ${position.name}`,
      before: deletedPosition,
      metadata: { catalog_type: "position" },
    });
    res.status(200).json({ code: 1, message: "Puesto eliminado correctamente" });
  } catch (error) {
    handleError(res, error, "No se pudo eliminar el puesto");
  }
};

module.exports = {
  createArea,
  createDepartment,
  createPosition,
  deleteArea,
  deleteDepartment,
  deletePosition,
  getSnapshot,
  listAreas,
  listDepartments,
  listPositions,
  updateArea,
  updateDepartment,
  updatePosition,
};

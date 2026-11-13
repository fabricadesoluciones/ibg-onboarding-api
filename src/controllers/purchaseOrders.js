const db = require("../models");

const { purchase_orders, purchase_order_lines, suppliers, Sequelize } = db;

const PENDING_STATUSES = ["pending", "pendiente", "active", "abierta", "abierto"];
const COMPLETED_STATUSES = ["completed", "concluida", "concluido", "closed", "cerrada", "cerrado"];

const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

const findSupplierByUserId = async (userId) => {
  if (!userId) return null;

  return suppliers.findOne({
    where: { user_id: userId },
    attributes: ["id"],
    raw: true,
  });
};

const getPurchaseOrdersDashboard = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ code: -1, message: "Unauthorized" });
    }

    const supplier = await findSupplierByUserId(userId);

    if (!supplier) {
      return res.status(200).json({
        code: 1,
        data: {
          summary: {
            pending: 0,
            completed: 0,
            totalBilling: 0,
            totalOrders: 0,
          },
          statusBreakdown: [],
          recentOrders: [],
        },
      });
    }

    const orders = await purchase_orders.findAll({
      where: { supplier_id: supplier.id },
      attributes: ["status", "total_amount"],
      raw: true,
    });

    const summary = orders.reduce(
      (acc, order) => {
        const normalizedStatus = normalizeStatus(order.status);
        const amount = Number(order.total_amount) || 0;

        acc.totalOrders += 1;
        acc.totalBilling += amount;

        if (PENDING_STATUSES.includes(normalizedStatus)) {
          acc.pending += 1;
        }

        if (COMPLETED_STATUSES.includes(normalizedStatus)) {
          acc.completed += 1;
        }

        return acc;
      },
      { pending: 0, completed: 0, totalBilling: 0, totalOrders: 0 }
    );

    const statusRows = await purchase_orders.findAll({
      where: { supplier_id: supplier.id },
      attributes: [
        "status",
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    });

    const statusBreakdown = statusRows.map((row) => ({
      status: row.status || "Sin estatus",
      count: Number(row.count) || 0,
    }));

    const recentOrdersRows = await purchase_orders.findAll({
      where: { supplier_id: supplier.id },
      attributes: ["id", "intelisis_folio", "status", "total_amount", "issue_date"],
      order: [["issue_date", "DESC"]],
      limit: 8,
      raw: true,
    });

    const recentOrders = recentOrdersRows.map((row) => ({
      id: Number(row.id),
      folio: row.intelisis_folio,
      status: row.status || "Sin estatus",
      totalAmount: Number(row.total_amount) || 0,
      issueDate: row.issue_date || null,
    }));

    return res.status(200).json({
      code: 1,
      data: {
        summary,
        statusBreakdown,
        recentOrders,
      },
    });
  } catch (error) {
    return res.status(500).json({
      code: -1,
      message: "Error al obtener dashboard de OC",
      error: error.message,
    });
  }
};

const getPurchaseOrderDetail = async (req, res) => {
  try {
    const userId = req.user?.id;
    const purchaseOrderId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({ code: -1, message: "Unauthorized" });
    }

    if (!Number.isFinite(purchaseOrderId) || purchaseOrderId <= 0) {
      return res.status(400).json({ code: -1, message: "ID de OC inválido" });
    }

    const supplier = await findSupplierByUserId(userId);

    if (!supplier) {
      return res.status(404).json({ code: -1, message: "Proveedor no encontrado" });
    }

    const order = await purchase_orders.findOne({
      where: { id: purchaseOrderId, supplier_id: supplier.id },
      attributes: [
        "id",
        "intelisis_folio",
        "status",
        "issue_date",
        "total_amount",
        "currency_id",
      ],
      raw: true,
    });

    if (!order) {
      return res.status(404).json({
        code: -1,
        message: "Orden de compra no encontrada o sin acceso",
      });
    }

    const linesRows = await purchase_order_lines.findAll({
      where: { purchase_order_id: purchaseOrderId },
      attributes: [
        "id",
        "line_number",
        "product_code",
        "description",
        "total_quantity",
        "received_quantity",
        "unit_price",
      ],
      order: [["line_number", "ASC"]],
      raw: true,
    });

    const lines = linesRows.map((line) => ({
      id: Number(line.id),
      lineNumber: Number(line.line_number),
      productCode: line.product_code,
      description: line.description || "",
      totalQuantity: Number(line.total_quantity) || 0,
      receivedQuantity: Number(line.received_quantity) || 0,
      unitPrice: Number(line.unit_price) || 0,
      lineTotal:
        (Number(line.total_quantity) || 0) * (Number(line.unit_price) || 0),
    }));

    return res.status(200).json({
      code: 1,
      data: {
        order: {
          id: Number(order.id),
          folio: order.intelisis_folio,
          status: order.status || "Sin estatus",
          issueDate: order.issue_date || null,
          totalAmount: Number(order.total_amount) || 0,
          currencyId: order.currency_id ?? null,
        },
        lines,
      },
    });
  } catch (error) {
    return res.status(500).json({
      code: -1,
      message: "Error al obtener detalle de orden de compra",
      error: error.message,
    });
  }
};

module.exports = {
  getPurchaseOrdersDashboard,
  getPurchaseOrderDetail,
};

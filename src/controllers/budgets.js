const db = require("../models");

const { cost_centers } = db;

const getBudgets = async (req, res) => {
  try {
    const rows = await cost_centers.findAll({
      attributes: ["id", "code", "name", "annual_budget", "used_budget"],
      order: [["name", "ASC"]],
      raw: true,
    });

    const data = rows.map((row) => {
      const annual = Number(row.annual_budget) || 0;
      const consumed = Number(row.used_budget) || 0;
      const pct = annual > 0 ? Math.round((consumed / annual) * 100) : 0;

      return {
        id: row.code || String(row.id),
        name: row.name,
        area: "Sin area",
        annual,
        consumed,
        pct,
      };
    });

    return res.status(200).json({
      code: 1,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      code: -1,
      message: "Error al obtener presupuestos",
      error: error.message,
    });
  }
};

module.exports = { getBudgets };

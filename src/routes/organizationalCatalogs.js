const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/organizationalCatalogs");

router.get("/snapshot", getSnapshot);

router.get("/areas", listAreas);
router.post("/areas", createArea);
router.put("/areas/:id", updateArea);
router.delete("/areas/:id", deleteArea);

router.get("/departments", listDepartments);
router.post("/departments", createDepartment);
router.put("/departments/:id", updateDepartment);
router.delete("/departments/:id", deleteDepartment);

router.get("/positions", listPositions);
router.post("/positions", createPosition);
router.put("/positions/:id", updatePosition);
router.delete("/positions/:id", deletePosition);

module.exports = router;

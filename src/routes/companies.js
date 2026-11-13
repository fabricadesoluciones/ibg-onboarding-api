const express = require("express");

const router = express.Router();
const {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} = require("../controllers/companies");

router.get("/", getCompanies);
router.post("/", createCompany);
router.put("/:id", updateCompany);
router.delete("/:id", deleteCompany);

module.exports = router;

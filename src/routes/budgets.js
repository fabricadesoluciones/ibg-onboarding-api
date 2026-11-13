const express = require("express");

const router = express.Router();
const { authMiddleware } = require("../middlewares/authMiddleware");
const { getBudgets } = require("../controllers/budgets");

router.get("/", authMiddleware, getBudgets);

module.exports = router;

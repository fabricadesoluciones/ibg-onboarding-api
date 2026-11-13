const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middlewares/authMiddleware");
const {
  getPurchaseOrdersDashboard,
  getPurchaseOrderDetail,
} = require("../controllers/purchaseOrders");

router.get("/dashboard", authMiddleware, getPurchaseOrdersDashboard);
router.get("/:id/detail", authMiddleware, getPurchaseOrderDetail);

module.exports = router;

const express = require("express");
const router = express.Router();

const { resetProviderPassword } = require("../controllers/user");
const { authMiddleware } = require("../middlewares/authMiddleware");

router.post("/:id/reset-password", authMiddleware, resetProviderPassword);

module.exports = router;

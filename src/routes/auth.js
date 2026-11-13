const express = require("express");
const router = express.Router();

const {
  login,
  loginDebugMfa,
  loginWithMicrosoftSso,
  verifyMfa,
  resendMfa,
  logout,
  me,
  firstAccessMe,
  completeFirstAccess,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth");
const { authMiddleware, firstAccessAuthMiddleware } = require("../middlewares/authMiddleware");


router.post("/login", login);
router.post("/login-debug-mfa", loginDebugMfa);
router.post("/sso/microsoft", loginWithMicrosoftSso);
router.post("/verify-mfa", verifyMfa);
router.post("/resend-mfa", resendMfa);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/first-access/me", firstAccessAuthMiddleware, firstAccessMe);
router.post("/first-access/complete", firstAccessAuthMiddleware, completeFirstAccess);
router.post("/logout", authMiddleware, logout);
router.get("/me", authMiddleware, me);

module.exports = router;

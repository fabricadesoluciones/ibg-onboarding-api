const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { authMiddleware } = require("../middlewares/authMiddleware");
const {
  saveMyRequest, getMyRequest, saveDocument, submitMyRequest, blockDocument, softDeleteDocument,
  updateBankAccount, listCfoBankAccounts, blockBankAccount, validateBankAccount, resetBankValidation,
} = require("../controllers/onboarding");
const { listPreRegistrations, createPreRegistration, sendPreRegistration, cancelPreRegistration } = require("../controllers/preRegistrations");

const router = express.Router();
const uploadDirectory = path.join(process.cwd(), "storage", "onboarding");
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, done) => done(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, done) => done(null, file.mimetype === "application/pdf"),
});

router.get("/requests/me", authMiddleware, getMyRequest);
router.get("/pre-registrations", authMiddleware, listPreRegistrations);
router.post("/pre-registrations", authMiddleware, createPreRegistration);
router.post("/pre-registrations/:id/send", authMiddleware, sendPreRegistration);
router.post("/pre-registrations/:id/cancel", authMiddleware, cancelPreRegistration);
router.post("/requests", authMiddleware, saveMyRequest);
router.post("/requests/:requestId/documents", authMiddleware, upload.single("document"), saveDocument);
router.post("/requests/:requestId/submit", authMiddleware, submitMyRequest);
router.patch("/requests/:requestId/documents/:documentId/block", authMiddleware, blockDocument);
router.delete("/requests/:requestId/documents/:documentId", authMiddleware, softDeleteDocument);
router.put("/requests/:requestId/bank-accounts/:accountId", authMiddleware, updateBankAccount);

router.get("/cfo/bank-accounts", authMiddleware, listCfoBankAccounts);
router.patch("/cfo/bank-accounts/:accountId/block", authMiddleware, blockBankAccount);
router.patch("/cfo/bank-accounts/:accountId/validate", authMiddleware, validateBankAccount);
router.patch("/cfo/bank-accounts/:accountId/reset-validation", authMiddleware, resetBankValidation);

module.exports = router;

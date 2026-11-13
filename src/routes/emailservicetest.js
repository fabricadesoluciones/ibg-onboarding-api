const express = require("express");
const router = express.Router();

const { sendEmailTest } = require("../controllers/emailServiceTest");

router.post("/", sendEmailTest);

module.exports = router;

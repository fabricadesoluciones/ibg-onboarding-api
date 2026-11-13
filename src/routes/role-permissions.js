const express = require("express");
const router = express.Router();

const { create, update, remove } = require("../controllers/rolePermissions");

router.post("/create", create);
router.put("/update", update);
router.delete("/delete", remove);

module.exports = router;

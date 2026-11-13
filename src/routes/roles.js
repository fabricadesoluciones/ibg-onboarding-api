const express = require("express");
const router = express.Router();

// Importar las fucniones del controlador 
const {
  create,
  getDeletedRoles,
  getRoles,
  getDetail,
  remove,
  restore,
  update,
} = require("../controllers/roles.js");

router.get("/", getRoles);
router.get("/deleted", getDeletedRoles);
router.get('/detail/:id', getDetail);
router.post("/create", create);
router.post('/restore/:id', restore);
router.put('/update/:id', update);
router.delete('/delete/:id', remove);

module.exports = router;

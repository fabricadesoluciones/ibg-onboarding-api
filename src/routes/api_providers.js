const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middlewares/authMiddleware");
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const {
    loginApiProviders,
  	getApiProviders,
  	createApiProvider,
  	updateApiProvider,
  	destroyApiProvider,
    subirDocumentos
} = require("../controllers/api_providers");

router.post('/login_api_providers', loginApiProviders);
router.post("/getApiProviders", getApiProviders);
router.post('/createApiProvider', createApiProvider);
router.post('/updateApiProvider', updateApiProvider);
router.post('/destroyApiProvider', destroyApiProvider);
router.post('/subirDocumentos', upload.single('Documentos'), subirDocumentos);


module.exports = router;

const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authMiddleware");

// Importar las fucniones del controlador 
const {
    getUsers,
    getUser,
    registerUser,
    seedUser,
    postUser,
    updatedUser,
    deleteUser,
    hardDeleteUser,
    restoreUser,
    resetUserPassword,
    getUsersDeleted,
} = require("../controllers/user.js");

// Importar las fucniones del validador
// const {validatorRegister, validationLogin, validationUser, validatorUpdate } = require('../validators/user.js')

// Importar middleware
// const {authMiddleware} = require("../middlewares/authMiddleware.js")

//  Ruta , middleware, validation , funcion del cotrolador

/*
    Ejemplo de rutas con middleware:

    router.get("/",authMiddleware,  getUsers);
    router.get("/:id",authMiddleware, validationUser, getUser);
    router.post("/create",authMiddleware, validatorRegister,postUsers);
    router.put("/update",authMiddleware, validatorUpdate, updateUsers)
    router.delete("/:id",authMiddleware, validationUser,deleteUser);

*/
// users 

router.get("/", authMiddleware, getUsers);
router.get("/deleted", authMiddleware, getUsersDeleted);
router.get("/:id", authMiddleware, getUser);
router.post("/create", authMiddleware, postUser);
router.put("/update/:id", authMiddleware, updatedUser);
router.put("/reset-password/:id", authMiddleware, resetUserPassword);
router.delete("/delete/:id", authMiddleware, deleteUser);
router.delete("/hard-delete/:id", hardDeleteUser);
router.put("/restore/:id", authMiddleware, restoreUser);

module.exports = router;

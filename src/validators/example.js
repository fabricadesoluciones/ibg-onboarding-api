const { check } = require("express-validator");
const { validationResult} = require("express-validator");

const validatorRegister = [
    check("name").
        exists().withMessage("Nombre Obligatorio").
        notEmpty().withMessage("Nombre Obligatorio"),
    check("email").
        exists().withMessage("Correo Obligatorio").
        notEmpty().withMessage("Correo Obligatorio").
        isEmail().withMessage("El formato del correo no es valido"),
    check("password").
        exists().withMessage("Contraseña Obligatoria").
        notEmpty().withMessage("Contraseña Obligatoria").
        isLength({max:50, min: 6}).withMessage("La contraseña debe ser mayor a 6 caracteres"),
    (req, res, next) => {
        try {
            validationResult(req).throw();
            return next();
        } catch (error) {
            const mensage = error.array().map(err => err.msg)
            res.status(403);
            res.send({ errors: mensage });
        }
    }
];

const validationLogin = [
    check("email").
        exists().withMessage("Correo Obligatorio").
        notEmpty().withMessage("Correo Obligatorio").
        isEmail().withMessage("El formato del correo no es valido"),
    check("key").
        exists().withMessage("Key Obligatorio").
        notEmpty().withMessage("Key Obligatorio"),
        (req, res, next) => {
        try {
            validationResult(req).throw();
            return next();
        } catch (error) {
            const mensage = error.array().map(err => err.msg)
            
            res.status(403).json({code:0, message: mensage });
        }
    }
    ];

const validationUser = [
        check("id").
            exists().withMessage("Correo Obligatorio").
            notEmpty().withMessage("Correo Obligatorio"),
            (req, res, next) => {
                try {
                    validationResult(req).throw();
                    return next();
                } catch (error) {
                    const mensage = error.array().map(err => err.msg)
                
                    res.status(403).json({code:0, message: mensage });
                }
            }
        ];

const validatorUpdate = [
    check("name").
        exists().withMessage("Nombre Obligatorio").
        notEmpty().withMessage("Nombre Obligatorio"),
    check("email").
        exists().withMessage("Correo Obligatorio").
        notEmpty().withMessage("Correo Obligatorio").
        isEmail().withMessage("El formato del correo no es valido"),
    check("password").
        exists().withMessage("Contraseña Obligatoria"),
    (req, res, next) => {
        try {
            validationResult(req).throw();
            return next();
        } catch (error) {
            const mensage = error.array().map(err => err.msg)
            res.status(403);
            res.send({ errors: mensage });
        }
    }
];

module.exports = {validatorRegister, validationLogin, validationUser, validatorUpdate}
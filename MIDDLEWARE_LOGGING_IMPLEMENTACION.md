# Implementacion de Middleware, Logging y Documentacion

## Objetivo

Se implemento una base reutilizable para:

- manejo global de errores
- logging de requests y errores
- documentacion Swagger
- monitoreo basico con health check

## Que hace cada pieza

### `src/config/logger.js`

- centraliza logs de aplicacion
- escribe en consola en formato JSON
- guarda archivos en `logs/app.log` y `logs/error.log`

### `src/middlewares/requestLogger.js`

- registra cada request al terminar
- guarda metodo, url, status, duracion, ip, user-agent y userId si existe

### `src/middlewares/errorMiddleware.js`

- `notFoundHandler` responde 404 para rutas inexistentes
- `errorMiddleware` captura errores globales
- registra stack, status y mensaje
- responde JSON estandar:

```json
{
  "code": -1,
  "message": "mensaje de error",
  "details": null
}
```

### `src/utils/AppError.js`

- permite lanzar errores controlados con `statusCode`
- pensado para errores operativos como 400, 401, 404 y 409

### `src/utils/asyncHandler.js`

- evita repetir `try/catch` en cada controlador async
- cualquier error pasa al middleware global

## Integracion en `src/index.js`

- se removio el logging inseguro ligado a `req.apiGateway`
- se agrego `requestLogger`
- se publico Swagger en:
  - `/api/v1/docs`
  - `/api/v1/docs.json`
- se agrego health check en:
  - `/health`
- se conectaron `notFoundHandler` y `errorMiddleware` al final del pipeline
- arranque y errores de sincronizacion ahora usan `logger`

## Cambios en controladores

### `src/controllers/auth.js`

- `login` usa `asyncHandler`
- validaciones fallidas lanzan `AppError`
- errores ya no responden manualmente con `500`, ahora suben al middleware global

### `src/controllers/user.js`

- `getUsers` y `registerUser` usan `asyncHandler`
- validaciones y conflictos usan `AppError`

## Swagger

Se actualizo `src/swagger.json` para documentar:

## Como extender en el futuro

Para un nuevo controlador:

```js
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

const miControlador = asyncHandler(async (req, res) => {
  if (!req.body.name) {
    throw new AppError("name es requerido", 400);
  }

  return res.status(200).json({ code: 1, message: "OK" });
});
```

## Notas

- no se agregaron dependencias nuevas
- el proyecto sigue usando `sequelize.sync({ alter: true })`
- las rutas de usuarios siguen publicas porque este cambio se enfoco en logging, errores y documentacion

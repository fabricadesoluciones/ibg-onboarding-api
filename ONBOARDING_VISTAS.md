# Vistas de onboarding nacional

## 1. `/registro/nacional`

La URL abre `NewProvider` con `scope=nacional`. La vista tiene **31 campos fijos**, **1 condicional** (`repseNum` cuando `repse=si`) y **6 campos por cada contacto**. Para una persona moral con un contacto son **37 campos visibles/capturables** (más `repseNum` si aplica).

Los 31 campos fijos son: `requestType`, `company`, `legalName`, `personType`, `rfc`, `legalRep`, `repse`, `commercialName`, `intelisis`, `street`, `noExt`, `noInt`, `colonia`, `zip`, `municipio`, `state`, `countryAddr`, `description`, `bank`, `bankCountry`, `branch`, `reference`, `account`, `clabe`, `currency`, `creditLine`, `creditDays`, `creditTerms`, `obs`, `signName`, `signature`. `currencyOther` también es condicional cuando `currency=other`.

Cada contacto contiene: `type`, `name`, `position`, `email`, `phone`, `other`. Obligatorios en UI/API: `type`, `name`, `email`, `phone`.

Obligatorios de la solicitud: `company`, `legalName`, `rfc`, `legalRep`, `street`, `noExt`, `zip`, `colonia`, `municipio`, `state`, `countryAddr`, `description`, `bank`, `account`, `clabe`, `signName` y un contacto válido. El API conserva los demás campos en `provider_onboarding_requests.form_data` y los contactos en `contacts`.

## 2. `/registro/nacional/documentos?type=moral`

Para `type=moral` hay **11 tipos documentales**: `csf`, `edocta`, `ine`, `domicilio`, `poder`, `acta`, `contrato`, `anexo`, `opinion`, `repse`, `certmarca`. Son obligatorios los siete primeros de negocio salvo `contrato` y `anexo`: `csf`, `edocta`, `ine`, `domicilio`, `poder`, `acta`, `opinion`; los otros cuatro son opcionales. `edocta`, `contrato`, `anexo` y `certmarca` admiten carga múltiple.

Por cada carga se envían: `document` (PDF), `documentType`, `validFrom`, `validUntil`, `isIndefinite`, `notApplicable` y, si corresponde, `notApplicableReason` (mínimo 15 caracteres). `validUntil` se omite para vigencia indefinida. `anexo` requiere previamente un contrato vigente en el frontend.

## API y base de datos

- `POST /api/v1/onboarding/requests`: guarda/actualiza el formulario autenticado.
- `POST /api/v1/onboarding/requests/:requestId/documents`: recibe `multipart/form-data` y conserva cada versión del documento.
- `GET /api/v1/onboarding/requests/me`: devuelve solicitud y documentos.

La migración `20261112153000-create-provider-onboarding-documents.js` crea `provider_onboarding_documents`, ligada por `onboarding_request_id`. Esto evita usar `supplier_documents`, que solo tiene tipo, ruta y validación; no puede persistir vigencias, versiones o “No aplica”. Ejecutar `npm run db:migrate` antes de probar.

## Ejecutar con Postman, desde cero

1. En una terminal, entra a `ibg-onboarding-api`, instala dependencias con `npm install`, aplica la estructura con `npm run db:migrate` e inicia el API con `npm run dev`. Debe responder `200` en `http://localhost:3001/health`.
2. Importa `postman/onboarding-vistas.postman_collection.json` en Postman. En las variables de la colección registra `baseUrl`, `email`, `password` y la ruta absoluta de un PDF en `pdfFile`. No pegues el JWT: la colección lo guarda sola en `token`.
3. Ejecuta en este orden: `0. Validar API activa`, `1. Iniciar sesión del proveedor`, `2. Guardar registro nacional`, `3. Cargar CSF PDF de persona moral`, `4. Consultar mi solicitud y documentos` y, al terminar, `5. Cerrar sesión`.
4. Si el login responde `mfa_required: true`, escribe el código que llegó al correo en la variable `mfaCode`, ejecuta `1b. Verificar MFA` y continúa con el paso 2. Si responde `first_access_required: true`, el proveedor debe terminar su primer acceso/cambio de contraseña antes de poder usar las rutas protegidas.

La petición 2 guarda automáticamente `requestId`; la petición 3 lo usa en su URL. Para los demás documentos duplica la petición 3 y cambia `documentType`, fechas y archivo. La lista válida de tipos está en la sección de documentos de este archivo.

## Cascada documental y flujo CFO

Las reglas se validan en el servidor, aun si la llamada viene de Postman:

- Un `anexo` solo se acepta si hay un `contrato` activo, vigente y no bloqueado para la misma solicitud.
- `PATCH /api/v1/onboarding/requests/:requestId/documents/:documentId/block` bloquea un documento. Si es un contrato, bloquea también todos sus anexos activos.
- `DELETE /api/v1/onboarding/requests/:requestId/documents/:documentId` hace baja lógica: deja `deleted_at` y conserva la evidencia; si es contrato, bloquea los anexos.
- Al crear o cambiar banco, cuenta o CLABE/IBAN, la cuenta vuelve a `pending_validation` y queda registrada la razón del reinicio.
- Un CFO puede listar cuentas, validarlas, reiniciar su validación o bloquearlas. Un bloqueo deja estado `blocked` y registra alertas internas en `notifications` para los roles de CFO/directivo configurados.

Rutas CFO:

- `GET /api/v1/onboarding/cfo/bank-accounts?status=pending_validation`
- `PATCH /api/v1/onboarding/cfo/bank-accounts/:accountId/validate`
- `PATCH /api/v1/onboarding/cfo/bank-accounts/:accountId/reset-validation`
- `PATCH /api/v1/onboarding/cfo/bank-accounts/:accountId/block`

Para probarlas en Postman configura `cfoEmail` y `cfoPassword` con un usuario cuyo rol sea `CFO`, `Director`, `Finanzas`, `Tesorería` o `Admin`. En producción conviene declarar los roles autorizados explícitamente con `CFO_ROLE_IDS=12,15` y, si los destinatarios de alertas son diferentes, `CFO_ALERT_USER_IDS=22,31`.

La colección ejecuta la demostración en este orden: crea solicitud/cuenta, carga contrato y anexo, valida la cuenta con CFO, modifica la CLABE para demostrar el reset, bloquea el contrato para demostrar el rechazo `409` del anexo, hace baja lógica y finalmente bloquea la cuenta con alertas. Elige un RFC de prueba diferente para cada proveedor, pues `tax_id` es único.

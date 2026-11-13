# Guia de Auditoria

## Objetivo

Este proyecto usa una bitacora central en `audit_logs` para guardar:

- quien hizo la accion
- desde que modulo
- sobre que registro
- cuando ocurrio
- estado antes y despues del cambio

## Helper recomendado

La forma recomendada para nuevos controladores es usar `createModuleAuditLogger`:

```js
const { createModuleAuditLogger } = require("../services/auditLogService");

const auditPurchaseOrders = createModuleAuditLogger({
  moduleKey: "internal_purchase_orders",
  moduleName: "Ordenes de Compra",
  targetType: "purchase_order",
});
```

Luego, cuando la operacion termine bien:

```js
await auditPurchaseOrders(req, {
  action: "update",
  targetId: order.id,
  entityName: order.folio,
  before: previousOrder,
  after: updatedOrder,
});
```

## Acciones sugeridas

- `create`
- `update`
- `delete`
- `hard_delete`
- `restore`
- `reset_password`
- `reset_provider_password`

## Payload minimo

### Crear

```js
await auditModule(req, {
  action: "create",
  targetId: item.id,
  entityName: item.name,
  after: item,
});
```

### Actualizar

```js
await auditModule(req, {
  action: "update",
  targetId: item.id,
  entityName: item.name,
  before: previousItem,
  after: updatedItem,
});
```

### Eliminar

```js
await auditModule(req, {
  action: "delete",
  targetId: item.id,
  entityName: item.name,
  before: deletedItem,
});
```

## Buenas practicas

- registrar la auditoria solo si la operacion principal termino correctamente
- para `update`, leer el estado anterior antes de modificar
- guardar snapshots ya serializados y limpios
- no mandar passwords, tokens o secretos; el helper ya intenta redactorlos
- usar `entityName` para que la descripcion salga amigable

## Donde esta la implementacion

- servicio base: `src/services/auditLogService.js`
- endpoint consulta bitacora: `src/controllers/bitacora.js`
- vista frontend: `ibg_prov_front/src/pages/app/Repository/index.tsx`

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const router = express.Router();
const { createModuleAuditLogger } = require("../services/auditLogService");

const auditExternalProviders = createModuleAuditLogger({
    moduleKey: "external_providers_integration",
    moduleName: "Integracion Proveedores Externos",
    targetType: "external_provider",
});
const removeTempFile = async (filePath) => {
    if (!filePath) return;

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('No se pudo eliminar el archivo temporal:', error.message);
        }
    }
};

const getBearerToken = (req) => {
    const bodyToken = req.body?.createdBearerToken;
    if (bodyToken) {
        return bodyToken;
    }

    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
};

const sanitizeProviderPayload = (payload = {}) =>
    Object.fromEntries(
        Object.entries(payload).filter(([key]) => ![
            'createdBearerToken',
            'password',
            'authorization',
            'Authorization',
        ].includes(key))
    );

const loginApiProviders = async (req, res) => {
    try {
        // 1. Extraemos los datos que envía tu cliente en el req.body
        const { username, password } = req.body;

        // Validación básica
        if (!username || !password) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El username y password son requeridos.' 
            });
        }

        // 2. Traemos la configuración desde tu .env
        const url = process.env.EXTERNAL_WS_URL+'/api/Auth/login';
        const bearerToken = process.env.EXTERNAL_WS_BEARER;

        if (!url || !bearerToken) {
            return res.status(500).json({
                status: 'error',
                message: 'Error de configuración interna (Faltan variables de entorno).'
            });
        }

        // 3. Armamos la petición para el WS externo
        const headers = {
            'accept': '*/*',
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
        };

        const dataForExternalWS = {
            username: username,
            password: password
        };

        // 4. Consumimos el Web Service externo con Axios
        const response = await axios.post(url, dataForExternalWS, { headers });

        await auditExternalProviders(req, {
            action: 'login',
            targetId: username,
            entityName: `usuario externo ${username}`,
            metadata: {
                username,
            },
            description: `Se autentico un usuario contra el WS externo de proveedores`,
        });

        // 5. Retornamos la respuesta del WS externo a tu cliente original
        return res.status(200).json({
            status: 'success',
            data: response.data
        });

    } catch (error) {
        // 6. Manejo de errores adaptado
        if (error.response) {
            // El WS externo respondió pero con un código de error (4xx o 5xx)
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Error devuelto por el Web Service externo',
                details: error.response.data
            });
        } else if (error.request) {
            // No hubo respuesta del WS externo (Timeout, IP caída, etc)
            return res.status(503).json({
                status: 'error',
                message: 'El Web Service externo no responde.'
            });
        } else {
            // Error interno al procesar la petición en Node
            console.error('Error interno del controlador:', error.message);
            return res.status(500).json({
                status: 'error',
                message: 'Error interno del servidor.'
            });
        }
    }
};

const getApiProviders = async (req, res) => {
    try {
        // 1. Extraemos los datos que envía tu cliente en el req.body
        const { createdBearerToken, filtro } = req.body;

        // 2. Traemos la configuración desde tu .env
        const url = process.env.EXTERNAL_WS_URL+'/transaction/Proveedores';

        if (!url) {
            return res.status(500).json({
                status: 'error',
                message: 'Error de configuración interna (Faltan variables de entorno).'
            });
        }

        // 3. Armamos la petición para el WS externo
        const headers = {
            'accept': 'text/plain',
            'Authorization': `Bearer ${createdBearerToken}`,
            'Content-Type': 'application/json'
        };

        const queryParams = {};
        if (filtro && filtro.trim() !== "") {
            queryParams.filtro = filtro; // Cambia 'filtro' por el nombre exacto que espera el WS externo (ej: 'search', 'query', etc.)
        }

        // 4. Consumimos el Web Service externo con Axios
        const response = await axios.get(url, { 
            headers: headers,
            params: queryParams 
        });

        // 5. Retornamos la respuesta del WS externo a tu cliente original
        return res.status(200).json({
            status: 'success',
            data: response.data
        });

    } catch (error) {
        // 6. Manejo de errores adaptado
        if (error.response) {
            // El WS externo respondió pero con un código de error (4xx o 5xx)
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Error devuelto por el Web Service externo',
                details: error
            });
        } else if (error.request) {
            // No hubo respuesta del WS externo (Timeout, IP caída, etc)
            return res.status(503).json({
                status: 'error',
                message: 'El Web Service externo no responde.'
            });
        } else {
            // Error interno al procesar la petición en Node
            console.error('Error interno del controlador:', error.message);
            return res.status(500).json({
                status: 'error',
                message: 'Error interno del servidor.'
            });
        }
    }
};


const createApiProvider = async (req, res) => {
    try {
        // 1. Extraemos el token y separamos los datos del proveedor
        const { createdBearerToken, ...providerData } = req.body;

        if (!createdBearerToken) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El createdBearerToken es requerido.' 
            });
        }

        const url = process.env.EXTERNAL_WS_URL+'/transaction/Proveedores';

        // 2. Creamos una instancia de FormData nativa de Node.js
        const formData = new FormData();
        formData.append('accion', 'ALTA');
        // 3. Iteramos sobre todos los campos del proveedor para agregarlos al FormData automáticamente
        Object.keys(providerData).forEach(key => {
            // Validamos que el valor no sea undefined o null
            if (providerData[key] !== undefined && providerData[key] !== null) {
                // FormData convierte todo a string internamente, pero Axios lo maneja de forma transparente
                formData.append(key, providerData[key]);
            }
        });

        // 4. Configuramos las cabeceras
        // OJO: No definimos manualmente 'Content-Type': 'multipart/form-data'. 
        // Es mejor dejar que Axios y el FormData calculen el "boundary" correcto automáticamente.
        const headers = {
            'accept': 'text/plain',
            'Authorization': `Bearer ${createdBearerToken}`
        };

        // 5. Consumimos el Web Service externo pasando el formData como cuerpo
        const response = await axios.post(url, formData, { headers });

        await auditExternalProviders(req, {
            action: 'create',
            targetId: providerData.IdProveedor || providerData.id || providerData.rfc || null,
            entityName: providerData.RazonSocial || providerData.nombre || providerData.id || 'proveedor externo',
            after: sanitizeProviderPayload(providerData),
        });

        return res.status(201).json({
            status: 'success',
            message: 'Proveedor creado exitosamente',
            data: response.data
        });

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Error devuelto por el Web Service externo',
                details: error.response.data
            });
        } else {
            console.error('Error interno en createApiProvider:', error.message);
            return res.status(500).json({
                status: 'error',
                message: 'Error interno del servidor.'
            });
        }
    }
};

const updateApiProvider = async (req, res) => {
    try {
        // 1. Extraemos el token y separamos los datos del proveedor
        const { createdBearerToken, ...providerData } = req.body;

        if (!createdBearerToken) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El createdBearerToken es requerido.' 
            });
        }

        const url = process.env.EXTERNAL_WS_URL+'/transaction/Proveedores';

        // 2. Creamos una instancia de FormData nativa de Node.js
        const formData = new FormData();
        formData.append('accion', 'Update');
        // 3. Iteramos sobre todos los campos del proveedor para agregarlos al FormData automáticamente
        Object.keys(providerData).forEach(key => {
            // Validamos que el valor no sea undefined o null
            if (providerData[key] !== undefined && providerData[key] !== null) {
                // FormData convierte todo a string internamente, pero Axios lo maneja de forma transparente
                formData.append(key, providerData[key]);
            }
        });

        const headers = {
        	'Content-Type': 'multipart/form-data',
            'accept': 'text/plain',
            'Authorization': `Bearer ${createdBearerToken}`
        };

        // 5. Consumimos el Web Service externo pasando el formData como cuerpo
        const response = await axios.post(url, formData, { headers });
        console.log(response);

        await auditExternalProviders(req, {
            action: 'update',
            targetId: providerData.IdProveedor || providerData.id || providerData.rfc || null,
            entityName: providerData.RazonSocial || providerData.nombre || providerData.id || 'proveedor externo',
            after: sanitizeProviderPayload(providerData),
        });

        return res.status(201).json({
            status: 'success',
            message: 'Respuesta del server correcta',
            data: response.data
        });

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Error devuelto por el Web Service externo',
                details: error
            });
        } else {
            return res.status(500).json({
                status: 'error',
                message: 'Error interno del servidor.'
            });
        }
    }
};

const destroyApiProvider = async (req, res) => {
    try {
        // 1. Extraemos el token y separamos los datos del proveedor
        const { createdBearerToken, ...providerData } = req.body;

        if (!createdBearerToken) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El createdBearerToken es requerido.' 
            });
        }

        const url = process.env.EXTERNAL_WS_URL+'/transaction/Proveedores';

        // 2. Creamos una instancia de FormData nativa de Node.js
        const formData = new FormData();
        // 3. Iteramos sobre todos los campos del proveedor para agregarlos al FormData automáticamente
        Object.keys(providerData).forEach(key => {
            // Validamos que el valor no sea undefined o null
            if (providerData[key] !== undefined && providerData[key] !== null) {
                // FormData convierte todo a string internamente, pero Axios lo maneja de forma transparente
                formData.append(key, providerData[key]);
            }
        });

        const headers = {
        	'Content-Type': 'multipart/form-data',
            'accept': 'text/plain',
            'Authorization': `Bearer ${createdBearerToken}`
        };
        console.log(formData);
        // 5. Consumimos el Web Service externo pasando el formData como cuerpo
        const response = await axios.post(url, formData, { headers });

        await auditExternalProviders(req, {
            action: 'delete',
            targetId: providerData.IdProveedor || providerData.id || providerData.rfc || null,
            entityName: providerData.RazonSocial || providerData.nombre || providerData.id || 'proveedor externo',
            before: sanitizeProviderPayload(providerData),
        });

        return res.status(201).json({
            status: 'success',
            message: 'Respuesta del server correcta',
            data: response.data
        });

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Error devuelto por el Web Service externo',
                details: error
            });
        } else {
            return res.status(500).json({
                status: 'error',
                message: 'Error interno del servidor.'
            });
        }
    }
};

const subirDocumentos = async (req, res) => {
    let tempFilePath;

    try {
        // 1. Extraemos token y campos del body (multer debe haber llenado req.file)
        const { IdProveedor, createdBearerToken: _, ...otherFields } = req.body;
        const file = req.file;
        const bearerToken = getBearerToken(req);
        tempFilePath = file?.path;

        if (!bearerToken) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Se requiere un token en createdBearerToken o en el header Authorization.'
            });
        }

        if (!file) {
            return res.status(400).json({ status: 'error', message: 'No se recibió el archivo Documentos.' });
        }

        // 2. URL destino (permitimos override vía EXTERNAL_UPLOAD_URL)
        const baseUrl = process.env.EXTERNAL_UPLOAD_URL || process.env.EXTERNAL_WS_URL;
        if (!baseUrl) {
            return res.status(500).json({
                status: 'error',
                message: 'Error de configuracion interna (faltan variables de entorno para subir documentos).'
            });
        }

        const url = `${baseUrl.replace(/\/$/, '')}/transaction/Proveedores/subirDocumentos`;

        // 3. Construimos FormData y anexamos campos
        const formData = new FormData();
        if (IdProveedor) formData.append('IdProveedor', IdProveedor);
        Object.keys(otherFields).forEach(key => {
            if (otherFields[key] !== undefined && otherFields[key] !== null) {
                formData.append(key, otherFields[key]);
            }
        });
        // Campo de archivo según Postman
        formData.append('Documentos', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
        });

        // 4. Cabeceras — estilo consistente con update/destroy
        const headers = {
            ...formData.getHeaders(),
            'accept': 'text/plain',
            'Authorization': `Bearer ${bearerToken}`
        };

        // 5. Enviamos al servicio externo
        const response = await axios.post(url, formData, { headers, maxBodyLength: Infinity, maxContentLength: Infinity });
        await removeTempFile(tempFilePath);

        await auditExternalProviders(req, {
            action: 'upload_document',
            targetId: IdProveedor || null,
            entityName: `proveedor externo ${IdProveedor || ''}`.trim(),
            metadata: {
                IdProveedor: IdProveedor || null,
                file_name: file.originalname,
                file_type: file.mimetype,
                fields: sanitizeProviderPayload(otherFields),
            },
            description: `Se subio un documento de proveedor al WS externo`,
        });

        return res.status(response.status || 200).json({ status: 'success', data: response.data });

    } catch (error) {
        await removeTempFile(tempFilePath);

        if (error.response) {
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Error devuelto por el Web Service externo',
                details: error.response.data || error.response.headers?.['www-authenticate'] || null
            });
        } else {
            console.error('Error interno en subirDocumentos:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            //k
            return res.status(500).json({ status: 'error', message: 'Error interno del servidor.' });
        }
    }
};

// Para probar la función
module.exports = {
	loginApiProviders,
	getApiProviders,
	createApiProvider,
	updateApiProvider,
    destroyApiProvider,
    subirDocumentos
}

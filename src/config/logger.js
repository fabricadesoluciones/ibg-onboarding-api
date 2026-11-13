const fs = require("fs");
const path = require("path");

// AWS inyecta esta variable automáticamente. Si existe, sabemos que estamos en la nube.
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const logsDir = path.join(process.cwd(), "logs");

const ensureLogsDir = () => {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

const writeLog = (fileName, payload) => {
  // Si estamos en AWS Lambda, abortamos la escritura de archivos físicos.
  // No tiene caso escribirlos porque se borran, y CloudWatch ya está grabando la consola.
  if (isLambda) return;

  try {
    ensureLogsDir();
    const filePath = path.join(logsDir, fileName);
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error("Logger file write failed:", error.message);
  }
};

const buildEntry = (level, message, meta = {}) => ({
  timestamp: new Date().toISOString(),
  level,
  message,
  ...meta,
});

const log = (level, message, meta = {}) => {
  const entry = buildEntry(level, message, meta);
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";

  // Esto es lo que CloudWatch atrapa automáticamente en AWS
  console[method](JSON.stringify(entry));
  
  // Esto solo escribirá el archivo físico si estás trabajando en tu entorno local
  writeLog(level === "error" ? "error.log" : "app.log", entry);
};

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
  http: (message, meta) => log("http", message, meta),
};
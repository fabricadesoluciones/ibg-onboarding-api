const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const logger = require("../config/logger");
const { SMTP_FROM, resolveEmailRecipient } = require("./emailDeliveryConfig");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const hasSmtpConfig = () =>
  Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

const isDevelopmentEnvironment = () => {
  const values = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.ENVIRONMENT,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return values.some(
    (value) => value.includes("dev") || value.includes("local")
  );
};

let smtpTransport = null;
let sesTransport = null;

const getSmtpTransport = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return smtpTransport;
};

const getSesTransport = () => {
  if (sesTransport) {
    return sesTransport;
  }

  const sesClient = new SESv2Client({
    region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1",
  });

  sesTransport = nodemailer.createTransport({
    SES: {
      sesClient,
      SendEmailCommand,
    },
  });

  return sesTransport;
};

const sendWithTransport = async (transport, payload) => {
  const info = await transport.sendMail(payload);

  return {
    delivered: true,
    messageId: info.messageId || null,
  };
};

const buildProviderLoginUrl = () => {
  const baseUrl =
    process.env.PROVIDER_PORTAL_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    "http://localhost:8080";

  return String(baseUrl).replace(/\/$/, "");
};

const sendProviderPasswordResetEmail = async ({
  to,
  name,
  temporaryPassword,
}) => {
  const resolvedTo = resolveEmailRecipient(to);
  const loginUrl = buildProviderLoginUrl();
  const subject = "Reinicio de contrasena del Portal de Proveedores";
  const text = [
    `Hola ${name || ""}`.trim(),
    "",
    "Un administrador reinicio tu contrasena del Portal de Proveedores.",
    "",
    "Tu nueva contrasena temporal es:",
    temporaryPassword,
    "",
    "Para ingresar utiliza el siguiente enlace:",
    loginUrl,
    "",
    "En tu siguiente acceso deberas cambiar esta contrasena.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2>Reinicio de contrasena del Portal de Proveedores</h2>
      <p>${name ? `Hola ${name},` : "Hola,"}</p>
      <p>Un administrador reinicio tu contrasena del Portal de Proveedores.</p>
      <p><strong>Tu nueva contrasena temporal es:</strong><br />${temporaryPassword}</p>
      <p>Para ingresar utiliza el siguiente enlace:</p>
      <p><a href="${loginUrl}">${loginUrl}</a></p>
      <p>En tu siguiente acceso deberas cambiar esta contrasena.</p>
    </div>
  `;

  const payload = {
    from: SMTP_FROM,
    to: resolvedTo,
    subject,
    text,
    html,
  };

  try {
    const smtp = getSmtpTransport();

    if (smtp) {
      return await sendWithTransport(smtp, payload);
    }

    if (!SMTP_FROM) {
      throw new Error("SMTP_FROM no configurado");
    }

    return await sendWithTransport(getSesTransport(), payload);
  } catch (error) {
    logger.error("Error enviando correo de reinicio para proveedor", {
      to,
      resolvedTo,
      message: error.message,
      stack: error.stack,
    });

    if (isDevelopmentEnvironment()) {
      logger.warn(
        "Continuando en desarrollo sin envio real de correo de reinicio para proveedor",
        {
          to,
          resolvedTo,
          temporaryPassword,
        }
      );

      return { delivered: false, skipped: true };
    }

    throw new Error(
      `No se pudo enviar el correo de reinicio para proveedor: ${error.message}`
    );
  }
};

module.exports = { sendProviderPasswordResetEmail };

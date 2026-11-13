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

const sendProviderWelcomeEmail = async ({ email, temporaryPassword, loginUrl }) => {
  const subject = "Bienvenido al Portal de Proveedores";
  const to = resolveEmailRecipient(email);
  const text = [
    "Hola,",
    "",
    "Tu cuenta ha sido creada correctamente.",
    "",
    "Tus credenciales temporales son:",
    "",
    `Correo: ${email}`,
    `Contraseña temporal: ${temporaryPassword}`,
    "",
    "Estado:",
    "Pendiente de activacion",
    "",
    "Para ingresar utiliza el siguiente enlace:",
    "",
    loginUrl,
    "",
    "En tu primer ingreso deberas cambiar tu contrasena temporal.",
    "",
    "Muchas gracias.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2>Bienvenido al Portal de Proveedores</h2>
      <p>Hola,</p>
      <p>Tu cuenta ha sido creada correctamente.</p>
      <p><strong>Tus credenciales temporales son:</strong></p>
      <p>Correo:<br />${email}</p>
      <p>Contraseña temporal:<br />${temporaryPassword}</p>
      <p>Estado:<br />Pendiente de activacion</p>
      <p>Para ingresar utiliza el siguiente enlace:</p>
      <p><a href="${loginUrl}">${loginUrl}</a></p>
      <p>En tu primer ingreso deberás cambiar tu Contraseña temporal.</p>
      <p>Muchas gracias.</p>
    </div>
  `;

  const payload = {
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  };

  try {
    const smtp = getSmtpTransport();

    if (smtp) {
      logger.info("Enviando correo de bienvenida de proveedor por SMTP", {
        to,
        host: SMTP_HOST,
        port: SMTP_PORT,
      });
      return await sendWithTransport(smtp, payload);
    }

    if (!SMTP_FROM) {
      throw new Error("SMTP_FROM no configurado");
    }

    logger.info("Enviando correo de bienvenida de proveedor por SES", { to });
    return await sendWithTransport(getSesTransport(), payload);
  } catch (error) {
    logger.error("Error enviando correo de bienvenida de proveedor", {
      to,
      message: error.message,
      stack: error.stack,
    });

    if (isDevelopmentEnvironment()) {
      logger.warn("Continuando en desarrollo sin envio real de correo de bienvenida", {
        to,
        email,
      });

      return { delivered: false, skipped: true };
    }

    throw new Error(`No se pudo enviar el correo de bienvenida: ${error.message}`);
  }
};

module.exports = { sendProviderWelcomeEmail };

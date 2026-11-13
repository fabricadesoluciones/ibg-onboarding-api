const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const logger = require("../config/logger");
const { SMTP_FROM, resolveEmailRecipient } = require("./emailDeliveryConfig");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
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

const hasSmtpConfig = () =>
  Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

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

const sendPasswordResetEmail = async ({ to, resetLink, expiresInMinutes = 5 }) => {
  const resolvedTo = resolveEmailRecipient(to);
  const subject = "Recuperar contrasena";
  const text = [
    "Hola.",
    "",
    "Recibimos una solicitud para cambiar tu contrasena.",
    "",
    "Haz clic en el siguiente enlace:",
    "",
    resetLink,
    "",
    `Este enlace expira en ${expiresInMinutes} minutos.`,
    "",
    "Si no solicitaste este cambio puedes ignorar este correo.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2>Recuperar contrasena</h2>
      <p>Hola.</p>
      <p>Recibimos una solicitud para cambiar tu contrasena.</p>
      <p>Haz clic en el siguiente enlace:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>Este enlace expira en ${expiresInMinutes} minutos.</p>
      <p>Si no solicitaste este cambio puedes ignorar este correo.</p>
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
    logger.error("Error enviando correo de recuperacion", {
      to,
      resolvedTo,
      message: error.message,
      stack: error.stack,
    });

    if (isDevelopmentEnvironment()) {
      logger.warn("Continuando en desarrollo sin envio real de correo de recuperacion", {
        to,
        resolvedTo,
        resetLink,
      });
      return { delivered: false, skipped: true };
    }

    throw new Error(`No se pudo enviar el correo de recuperacion: ${error.message}`);
  }
};

module.exports = { sendPasswordResetEmail };

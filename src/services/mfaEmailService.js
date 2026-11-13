const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const logger = require("../config/logger");
const {
  SMTP_FROM,
  isSendEmailTestEnabled,
  resolveEmailRecipient,
} = require("./emailDeliveryConfig");

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
  Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

const isMfaEmailDeliveryEnabled = () => {
  const flag = process.env.MFA_EMAIL_ENABLED;

  if (flag !== undefined) {
    return String(flag).trim().toLowerCase() === "true";
  }

  return hasSmtpConfig() || Boolean(SMTP_FROM);
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

const sendMfaCodeEmail = async ({ to, name, code, expiresInMinutes }) => {
  const resolvedTo = resolveEmailRecipient(to);
  const safeName = name || "usuario";
  const subject = "Codigo de verificacion para tu inicio de sesion";

  const text = [
    `Hola ${safeName},`,
    "",
    "Recibimos un intento de inicio de sesion en tu cuenta de IB Group.",
    `Tu codigo de verificacion es: ${code}`,
    `Este codigo vence en ${expiresInMinutes} minutos.`,
    "",
    "Si no fuiste tu, cambia tu contrasena y contacta al administrador.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Verificacion de acceso</h2>
      <p>Hola ${safeName},</p>
      <p>Recibimos un intento de inicio de sesion en tu cuenta de IB Group.</p>
      <p>Ingresa este codigo de 6 digitos para continuar:</p>
      <div
        style="
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 8px;
          margin: 18px 0;
        "
      >
        ${code}
      </div>
      <p>Este codigo vence en ${expiresInMinutes} minutos.</p>
      <p style="color: #6b7280;">
        Si no fuiste tu, cambia tu contrasena y contacta al administrador.
      </p>
    </div>
  `;

  const payload = {
    from: SMTP_FROM,
    to: resolvedTo,
    subject,
    text,
    html,
  };

  if (!isMfaEmailDeliveryEnabled()) {
    logger.warn("Se omite el envio de correo MFA porque la entrega no esta habilitada", {
      to: resolvedTo,
      enabled: false,
    });

    return { delivered: false, skipped: true };
  }

  try {
    const smtp = getSmtpTransport();

    if (smtp) {
      logger.info("Enviando MFA por SMTP", {
        to,
        resolvedTo,
        from: SMTP_FROM,
        host: SMTP_HOST,
        port: SMTP_PORT,
      });
      return await sendWithTransport(smtp, payload);
    }

    if (!SMTP_FROM) {
      throw new Error("SMTP_FROM no configurado");
    }

    logger.info("Enviando MFA por SES", {
      to,
      resolvedTo,
      from: SMTP_FROM,
      sendEmailTestEnabled: isSendEmailTestEnabled(),
    });
    const ses = getSesTransport();
    return await sendWithTransport(ses, payload);
  } catch (error) {
    logger.error("Error enviando correo MFA", {
      to,
      resolvedTo,
      message: error.message,
      stack: error.stack,
    });

    if (isDevelopmentEnvironment() && !hasSmtpConfig() && !SMTP_FROM) {
      logger.warn("Continuando en desarrollo sin envio real de correo MFA", {
        to,
        resolvedTo,
        code,
      });

      return { delivered: false, skipped: true };
    }

    throw new Error(`No se pudo enviar el correo MFA: ${error.message}`);
  }
};

module.exports = { sendMfaCodeEmail };

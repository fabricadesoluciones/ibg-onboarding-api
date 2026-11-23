const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const logger = require("../config/logger");
const { SMTP_FROM, resolveEmailRecipients } = require("./emailDeliveryConfig");

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

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const emailLayout = ({ title, preview, content }) => `<!doctype html><html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#f1f5f9;color:#1e293b;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.10);"><tr><td style="padding:28px 36px;background:#0f172a;color:#fff;"><div style="font-size:13px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#93c5fd;">IB Group</div><div style="margin-top:6px;font-size:23px;font-weight:700;">${escapeHtml(title)}</div></td></tr><tr><td style="padding:34px 36px;font-size:16px;line-height:1.6;color:#334155;">${content}</td></tr><tr><td style="padding:20px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">Este es un mensaje automático de IB Group. No compartas tus credenciales ni enlaces de acceso.</td></tr></table></td></tr></table></body></html>`;

const sendProviderWelcomeEmail = async ({ email, temporaryPassword, loginUrl }) => {
  const subject = "Invitación al Portal de Proveedores de IB Group";
  const recipients = resolveEmailRecipients(email);
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

  const legacyHtml = `
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

  const html = emailLayout({ title: "Tu acceso al Portal de Proveedores", preview: "Tu cuenta y contraseña temporal están listas", content: `<p style="margin:0 0 16px;">Hola,</p><p style="margin:0 0 20px;">Se creó tu cuenta de proveedor. Ingresa con las siguientes credenciales temporales:</p><div style="margin:0 0 24px;padding:18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;"><strong>Correo:</strong> ${escapeHtml(email)}<br /><strong>Contraseña temporal:</strong> ${escapeHtml(temporaryPassword)}</div><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:#2563eb;"><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:13px 22px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">Ingresar al portal</a></td></tr></table><p style="margin:20px 0 0;color:#475569;">En tu primer ingreso deberás cambiar la contraseña temporal.</p>` });
  const payload = {
    from: SMTP_FROM,
    subject,
    text,
    html,
  };

  try {
    const smtp = getSmtpTransport();

    if (smtp) {
      logger.info("Enviando correo de bienvenida de proveedor por SMTP", {
        to: recipients,
        host: SMTP_HOST,
        port: SMTP_PORT,
      });
      const results = await Promise.allSettled(recipients.map((to) => sendWithTransport(smtp, { ...payload, to })));
      const delivered = results.filter((result) => result.status === "fulfilled");
      const failed = results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || "Error de envío");
      if (!delivered.length) throw new Error(failed.join("; ") || "No se pudo entregar el correo");
      if (failed.length) logger.warn("Algunos destinatarios no recibieron la invitación", { recipients, failed });
      return { delivered: true, messageIds: delivered.map((result) => result.value.messageId), failed };
    }

    if (!SMTP_FROM) {
      throw new Error("SMTP_FROM no configurado");
    }

    logger.info("Enviando correo de bienvenida de proveedor por SES", { to: recipients });
    const results = await Promise.allSettled(recipients.map((to) => sendWithTransport(getSesTransport(), { ...payload, to })));
    const delivered = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || "Error de envío");
    if (!delivered.length) throw new Error(failed.join("; ") || "No se pudo entregar el correo");
    if (failed.length) logger.warn("Algunos destinatarios no recibieron la invitación", { recipients, failed });
    return { delivered: true, messageIds: delivered.map((result) => result.value.messageId), failed };
  } catch (error) {
    logger.error("Error enviando correo de bienvenida de proveedor", {
      to: recipients,
      message: error.message,
      stack: error.stack,
    });

    if (isDevelopmentEnvironment()) {
      logger.warn("Continuando en desarrollo sin envio real de correo de bienvenida", {
        to: recipients,
        email,
      });

      return { delivered: false, skipped: true };
    }

    throw new Error(`No se pudo enviar el correo de bienvenida: ${error.message}`);
  }
};

module.exports = { sendProviderWelcomeEmail };

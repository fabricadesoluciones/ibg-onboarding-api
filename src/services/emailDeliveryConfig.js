const SMTP_FROM =
  process.env.RESEND_FROM ||
  process.env.SES_SOURCE_EMAIL ||
  process.env.SMTP_FROM ||
  "";
const SEND_EMAIL_TEST_TO = process.env.SEND_EMAIL_TEST_TO || "";
const TEST_EMAIL_RECIPIENTS = new Set([
  "jherrera@fabricadesoluciones.com",
  "notificacionesportalfd@ibgp.com.mx",
  "ebecerril@ibgp.com.mx",
]);

const isSendEmailTestEnabled = () =>
  String(process.env.SEND_EMAIL_TEST || "").trim() === "1";

const parseRecipients = (value) => String(value || "").split(",")
  .map((recipient) => recipient.trim().toLowerCase()).filter(Boolean);

const resolveEmailRecipients = (recipient) => {
  const normalizedRecipient = String(recipient || "").trim();

  if (isSendEmailTestEnabled()) {
    const testRecipients = parseRecipients(SEND_EMAIL_TEST_TO);
    if (!testRecipients.length) {
      throw new Error(
        "SEND_EMAIL_TEST esta habilitado pero SEND_EMAIL_TEST_TO no esta configurado. "
      );
    }

    const unauthorized = testRecipients.filter((address) => !TEST_EMAIL_RECIPIENTS.has(address));
    if (unauthorized.length) console.warn("Destinatarios de prueba no autorizados:", unauthorized);
    const authorized = testRecipients.filter((address) => TEST_EMAIL_RECIPIENTS.has(address));
    if (!authorized.length) throw new Error("SEND_EMAIL_TEST_TO no contiene destinatarios autorizados");
    return authorized;
  }

  return normalizedRecipient ? [normalizedRecipient] : [];
};

module.exports = {
  SMTP_FROM,
  SEND_EMAIL_TEST_TO,
  isSendEmailTestEnabled,
  resolveEmailRecipients,
};

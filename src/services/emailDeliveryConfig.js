const SMTP_FROM =
  process.env.RESEND_FROM ||
  process.env.SES_SOURCE_EMAIL ||
  process.env.SMTP_FROM ||
  "";
const SEND_EMAIL_TEST_TO = process.env.SEND_EMAIL_TEST_TO || "";

const isSendEmailTestEnabled = () =>
  String(process.env.SEND_EMAIL_TEST || "").trim() === "1";

const resolveEmailRecipient = (recipient) => {
  const normalizedRecipient = String(recipient || "").trim();

  if (isSendEmailTestEnabled()) {
    if (!SEND_EMAIL_TEST_TO) {
      throw new Error(
        "SEND_EMAIL_TEST esta habilitado pero SEND_EMAIL_TEST_TO no esta configurado. "
      );
    }

    return SEND_EMAIL_TEST_TO;
  }

  return normalizedRecipient;
};

module.exports = {
  SMTP_FROM,
  SEND_EMAIL_TEST_TO,
  isSendEmailTestEnabled,
  resolveEmailRecipient,
};

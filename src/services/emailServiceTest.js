const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");
const {
  SMTP_FROM,
  isSendEmailTestEnabled,
  resolveEmailRecipient,
} = require("./emailDeliveryConfig");

const AWS_REGION_RAK =
  process.env.AWS_REGION_RAK || process.env.AWS_REGION || "us-east-2";
const SMTP_HOST = process.env.SMTP_HOST || "email-smtp.us-east-2.amazonaws.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

let sesClient = null;
let smtpTransporter = null;

const getSesClient = () => {
  if (!sesClient) {
    sesClient = new SESClient({
      region: AWS_REGION_RAK,
      endpoint: process.env.SES_ENDPOINT || undefined,
    });
  }

  return sesClient;
};

const getSmtpTransporter = () => {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return smtpTransporter;
};

const sendSesEmail = async ({
  toAddresses,
  subject,
  text,
}) => {
  const recipients = Array.isArray(toAddresses)
    ? toAddresses.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const resolvedRecipients = recipients.map((recipient) =>
    resolveEmailRecipient(recipient)
  );

  if (resolvedRecipients.length === 0) {
    throw new Error("At least one SES recipient is required");
  }

  if (!SMTP_FROM) {
    throw new Error("SES source email is not configured");
  }

  const client = getSesClient();
  const command = new SendEmailCommand({
    Source: SMTP_FROM,
    Destination: {
      ToAddresses: resolvedRecipients,
    },
    Message: {
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: text,
        },
      },
    },
  });

  const response = await client.send(command);

  return {
    messageId: response.MessageId || null,
    source: SMTP_FROM,
    destinations: resolvedRecipients,
    requestedDestinations: recipients,
    sendEmailTestEnabled: isSendEmailTestEnabled(),
    region: AWS_REGION_RAK,
  };
};

const sendTestEmailSmtp = async () => {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP credentials are not configured");
  }

  const transporter = getSmtpTransporter();
  const response = await transporter.sendMail({
    from: SMTP_FROM,
    to: SMTP_FROM,
    subject: "Prueba SMTP SES",
    text: "hola",
  });

  return {
    messageId: response.messageId || null,
    source: SMTP_FROM,
    destination: SMTP_FROM,
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
  };
};

module.exports = {
  sendSesEmail,
  sendTestEmailSmtp,
};

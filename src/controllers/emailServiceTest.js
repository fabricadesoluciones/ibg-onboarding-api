const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { sendSesEmail } = require("../services/emailServiceTest");

const sendEmailTest = asyncHandler(async (req, res) => {
  const { destinationEmail, subject, text } = req.body;

  if (!destinationEmail || !String(destinationEmail).trim()) {
    throw new AppError("El correo de destino es requerido", 400);
  }

  const emailSubject = subject || "Prueba de envío de correo SES";
  const emailText = text || "Este es un correo de prueba enviado desde el endpoint emailservicetest.";

  const result = await sendSesEmail({
    toAddresses: [destinationEmail],
    subject: emailSubject,
    text: emailText,
  });

  res.status(200).json({
    code: 1,
    message: "Correo enviado correctamente",
    result,
  });
});

module.exports = {
  sendEmailTest,
};

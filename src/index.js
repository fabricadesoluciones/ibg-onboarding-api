const express = require("express");
require("dotenv").config();

const app = express();
const serverless = require("serverless-http");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");
const logger = require("./config/logger");
const requestLogger = require("./middlewares/requestLogger");
const { errorMiddleware, notFoundHandler } = require("./middlewares/errorMiddleware");
const { sequelize } = require("./models/connection.js");
const initModels = require("./models/init-models.js");

const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("storage"));
app.use("/storage", express.static("storage"));
app.use(requestLogger);

app.get("/health", (req, res) => {
  res.status(200).json({
    code: 1,
    message: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/api/v1/docs.json", (req, res) => {
  res.status(200).json(swaggerDocument);
});

app.use("/api/v1", require("./routes"));
app.use(notFoundHandler);
app.use(errorMiddleware);

const models = initModels(sequelize);

// Sincronizacion automatica de tablas deshabilitada por solicitud.
// sequelize
//   .sync({ alter: true })
//   .then(() => {
//     logger.info("Database synchronized successfully");
//     app.listen(port, () => {
//       logger.info("Server started", { port });
//     });
//   })
//   .catch((err) => {
//     logger.error("Database synchronization failed", {
//       message: err.message,
//       stack: err.stack,
//     });
//   });

app.listen(port, () => {
  logger.info("Server started", { port });
});

module.exports.handler = serverless(app);

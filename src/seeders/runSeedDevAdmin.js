require("dotenv").config();

const logger = require("../config/logger");
const { sequelize } = require("../models/connection");
const initModels = require("../models/init-models");
const seedDevAdmin = require("./seedDevAdmin");

const run = async () => {
  const models = initModels(sequelize);

  try {
    // Sincronizacion automatica de tablas deshabilitada por solicitud.
    // await sequelize.sync({ alter: true });
    await seedDevAdmin(models, logger);
    logger.info("Admin seed executed successfully");
  } catch (error) {
    logger.error("Admin seed failed", {
      message: error.message,
      stack: error.stack,
    });
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

run();

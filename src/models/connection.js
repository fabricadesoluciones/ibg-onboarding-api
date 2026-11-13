const { Sequelize } = require("sequelize");

// Configuración de la conexión a la base de datos
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PWD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    pool: {
      max: 5, // Máximo 5 conexiones activas a la vez
      min: 0, // Mínimo 0 conexiones activas cuando no hay uso
      acquire: 30000, // Intentar establecer conexión durante 30 segundos antes de fallar
      idle: 10000, // Cerrar conexiones que estén inactivas por más de 10 segundos
    },
    logging: false, // Desactivar los mensajes de registro de Sequelize
  }
);

// console.info('Host:', sequelize.config.host);
// console.info('Database:', sequelize.config.database);
// console.info('Username:', sequelize.config.username);
// console.info('Port:', sequelize.config.port);
// console.info('Dialect:', sequelize.config.dialect);
// console.info('Pool:', sequelize.config.pool);

module.exports = {
  sequelize,
};

const { sequelize } = require("./connection.js");
const { initModels, syncModels } = require("./init-models");

const models = initModels(sequelize);

// syncModels([
//   { model: models.users },
//   // { model: models.menu_modules },
//   // { model: models.menu_sub_modules},
// ]);

module.exports = models;

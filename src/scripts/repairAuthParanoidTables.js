require("dotenv").config();

const { sequelize } = require("../models/connection");

const tables = ["roles", "users", "user_sessions"];

const run = async () => {
  try {
    for (const table of tables) {
      await sequelize.query(
        `ALTER TABLE \`${table}\` MODIFY \`deleted_at\` DATETIME NULL DEFAULT NULL`
      );
      await sequelize.query(
        `UPDATE \`${table}\` SET \`deleted_at\` = NULL WHERE \`deleted_at\` IS NOT NULL`
      );
      console.log(`Repaired ${table}.deleted_at`);
    }

    console.log("Auth paranoid tables repaired successfully.");
  } catch (error) {
    console.error("Repair failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

run();

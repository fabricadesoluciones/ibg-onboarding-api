'use strict';

/**
 * Repara instalaciones donde user_roles fue creado previamente sin la llave
 * primaria id, requerida por el modelo role_assignments de usuarios.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.map((table) => String(table).toLowerCase()).includes('user_roles')) {
      return;
    }

    const columns = await queryInterface.describeTable('user_roles');
    if (!columns.id) {
      const [primaryKey] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM user_roles WHERE Key_name = 'PRIMARY'"
      );

      if (primaryKey.length) {
        await queryInterface.sequelize.query('ALTER TABLE user_roles DROP PRIMARY KEY');
      }

      await queryInterface.addColumn('user_roles', 'id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        first: true,
      });
    }

    const [indexes] = await queryInterface.sequelize.query('SHOW INDEX FROM user_roles');
    const hasUniqueUserRole = indexes.some(
      (index) => Number(index.Non_unique) === 0 &&
        ['user_id', 'role_id'].includes(String(index.Column_name)) &&
        String(index.Key_name) !== 'PRIMARY'
    );

    if (!hasUniqueUserRole) {
      await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], {
        unique: true,
        name: 'user_roles_unique_user_role',
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('user_roles');
    if (columns.id) {
      await queryInterface.removeColumn('user_roles', 'id');
    }
  },
};

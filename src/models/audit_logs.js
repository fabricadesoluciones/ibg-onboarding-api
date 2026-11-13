const Sequelize = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  return audit_logs.init(sequelize, DataTypes);
};

class audit_logs extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init(
      {
        id: {
          autoIncrement: true,
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
          primaryKey: true,
        },
        actor_user_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: true,
        },
        actor_name: {
          type: DataTypes.STRING(150),
          allowNull: true,
        },
        actor_email: {
          type: DataTypes.STRING(150),
          allowNull: true,
        },
        module_key: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        module_name: {
          type: DataTypes.STRING(150),
          allowNull: false,
        },
        action: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        target_type: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        target_id: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        description: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        metadata: {
          type: DataTypes.TEXT,
          allowNull: true,
          get() {
            const rawValue = this.getDataValue("metadata");
            if (!rawValue) return null;

            try {
              return JSON.parse(rawValue);
            } catch (_error) {
              return rawValue;
            }
          },
          set(value) {
            this.setDataValue(
              "metadata",
              value == null ? null : JSON.stringify(value)
            );
          },
        },
        ip_address: {
          type: DataTypes.STRING(64),
          allowNull: true,
        },
        user_agent: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: "audit_logs",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "id" }],
          },
          {
            name: "audit_logs_module_key_idx",
            using: "BTREE",
            fields: [{ name: "module_key" }],
          },
          {
            name: "audit_logs_action_idx",
            using: "BTREE",
            fields: [{ name: "action" }],
          },
          {
            name: "audit_logs_actor_user_id_idx",
            using: "BTREE",
            fields: [{ name: "actor_user_id" }],
          },
          {
            name: "audit_logs_created_at_idx",
            using: "BTREE",
            fields: [{ name: "created_at" }],
          },
        ],
      }
    );
  }
}

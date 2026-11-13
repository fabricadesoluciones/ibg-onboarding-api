const DataTypes = require("sequelize").DataTypes;
const _audit_logs = require("./audit_logs");
const _areas = require("./areas");
const _advance_amortizations = require("./advance_amortizations");
const _approval_hierarchies = require("./approval_hierarchies");
const _approval_workflows = require("./approval_workflows");
const _bank_transactions = require("./bank_transactions");
const _business_rules = require("./business_rules");
const _companies = require("./companies");
const _cost_centers = require("./cost_centers");
const _currencies = require("./currencies");
const _customs_declarations = require("./customs_declarations");
const _departments = require("./departments");
const _exchange_rates_dof = require("./exchange_rates_dof");
const _installments_advances = require("./installments_advances");
const _invoice_adjustments = require("./invoice_adjustments");
const _invoice_purchase_order = require("./invoice_purchase_order");
const _invoices = require("./invoices");
const _notifications = require("./notifications");
const _password_reset_tokens = require("./password_reset_tokens");
const _payment_complements = require("./payment_complements");
const _provider_onboarding_requests = require("./provider_onboarding_requests");
const _provider_onboarding_documents = require("./provider_onboarding_documents");
const _provider_bank_accounts = require("./provider_bank_accounts");
const _positions = require("./positions");
const _projects = require("./projects");
const _purchase_order_lines = require("./purchase_order_lines");
const _purchase_orders = require("./purchase_orders");
const _reconciliations = require("./reconciliations");
const _role_permissions = require("./role_permissions");
const _roles = require("./roles");
const _supplier_documents = require("./supplier_documents");
const _suppliers = require("./suppliers");
const _user_permissions = require("./user_permissions");
const _user_companies = require("./user_companies");
const _user_sessions = require("./user_sessions");
const _users = require("./users");

function initModels(sequelize) {
  const audit_logs = _audit_logs(sequelize, DataTypes);
  const areas = _areas(sequelize, DataTypes);
  const advance_amortizations = _advance_amortizations(sequelize, DataTypes);
  const approval_hierarchies = _approval_hierarchies(sequelize, DataTypes);
  const approval_workflows = _approval_workflows(sequelize, DataTypes);
  const bank_transactions = _bank_transactions(sequelize, DataTypes);
  const business_rules = _business_rules(sequelize, DataTypes);
  const companies = _companies(sequelize, DataTypes);
  const cost_centers = _cost_centers(sequelize, DataTypes);
  const currencies = _currencies(sequelize, DataTypes);
  const customs_declarations = _customs_declarations(sequelize, DataTypes);
  const departments = _departments(sequelize, DataTypes);
  const exchange_rates_dof = _exchange_rates_dof(sequelize, DataTypes);
  const installments_advances = _installments_advances(sequelize, DataTypes);
  const invoice_adjustments = _invoice_adjustments(sequelize, DataTypes);
  const invoice_purchase_order = _invoice_purchase_order(sequelize, DataTypes);
  const invoices = _invoices(sequelize, DataTypes);
  const notifications = _notifications(sequelize, DataTypes);
  const password_reset_tokens = _password_reset_tokens(sequelize, DataTypes);
  const payment_complements = _payment_complements(sequelize, DataTypes);
  const provider_onboarding_requests = _provider_onboarding_requests(sequelize, DataTypes);
  const provider_onboarding_documents = _provider_onboarding_documents(sequelize, DataTypes);
  const provider_bank_accounts = _provider_bank_accounts(sequelize, DataTypes);
  const positions = _positions(sequelize, DataTypes);
  const projects = _projects(sequelize, DataTypes);
  const purchase_order_lines = _purchase_order_lines(sequelize, DataTypes);
  const purchase_orders = _purchase_orders(sequelize, DataTypes);
  const reconciliations = _reconciliations(sequelize, DataTypes);
  const role_permissions = _role_permissions(sequelize, DataTypes);
  const roles = _roles(sequelize, DataTypes);
  const supplier_documents = _supplier_documents(sequelize, DataTypes);
  const suppliers = _suppliers(sequelize, DataTypes);
  const user_permissions = _user_permissions(sequelize, DataTypes);
  const user_companies = _user_companies(sequelize, DataTypes);
  const user_sessions = _user_sessions(sequelize, DataTypes);
  const users = _users(sequelize, DataTypes);

  audit_logs.belongsTo(users, {
    as: "actor_user",
    foreignKey: "actor_user_id"
  });
  users.hasMany(audit_logs, {
    as: "audit_logs",
    foreignKey: "actor_user_id"
  });

  departments.belongsTo(areas, {
    as: "area",
    foreignKey: "area_id",
  });
  areas.hasMany(departments, {
    as: "departments",
    foreignKey: "area_id",
  });

  positions.belongsTo(areas, {
    as: "area",
    foreignKey: "area_id",
  });
  positions.belongsTo(departments, {
    as: "department",
    foreignKey: "department_id",
  });
  areas.hasMany(positions, {
    as: "positions",
    foreignKey: "area_id",
  });
  departments.hasMany(positions, {
    as: "positions",
    foreignKey: "department_id",
  });

  roles.belongsTo(areas, {
    as: "area",
    foreignKey: "area_id",
  });
  roles.belongsTo(departments, {
    as: "department",
    foreignKey: "department_id",
  });
  roles.belongsTo(positions, {
    as: "position",
    foreignKey: "position_id",
  });
  areas.hasMany(roles, {
    as: "roles",
    foreignKey: "area_id",
  });
  departments.hasMany(roles, {
    as: "roles",
    foreignKey: "department_id",
  });
  positions.hasMany(roles, {
    as: "roles",
    foreignKey: "position_id",
  });

  users.belongsToMany(companies, {
    as: "companies",
    through: user_companies,
    foreignKey: "user_id",
    otherKey: "company_id"
  });
  companies.belongsToMany(users, {
    as: "users",
    through: user_companies,
    foreignKey: "company_id",
    otherKey: "user_id"
  });
  user_companies.belongsTo(users, {
    as: "user",
    foreignKey: "user_id"
  });
  user_companies.belongsTo(companies, {
    as: "company",
    foreignKey: "company_id"
  });
  users.hasMany(user_companies, {
    as: "user_companies",
    foreignKey: "user_id"
  });
  companies.hasMany(user_companies, {
    as: "user_companies",
    foreignKey: "company_id"
  });

  provider_onboarding_requests.belongsTo(users, {
    as: "user",
    foreignKey: "user_id",
  });
  users.hasMany(provider_onboarding_requests, {
    as: "provider_onboarding_requests",
    foreignKey: "user_id",
  });
  provider_onboarding_requests.belongsTo(suppliers, {
    as: "supplier",
    foreignKey: "supplier_id",
  });
  suppliers.hasMany(provider_onboarding_requests, {
    as: "onboarding_requests",
    foreignKey: "supplier_id",
  });
  provider_onboarding_documents.belongsTo(provider_onboarding_requests, {
    as: "onboarding_request", foreignKey: "onboarding_request_id",
  });
  provider_onboarding_requests.hasMany(provider_onboarding_documents, {
    as: "documents", foreignKey: "onboarding_request_id",
  });
  provider_bank_accounts.belongsTo(provider_onboarding_requests, {
    as: "onboarding_request", foreignKey: "onboarding_request_id",
  });
  provider_onboarding_requests.hasMany(provider_bank_accounts, {
    as: "bank_accounts", foreignKey: "onboarding_request_id",
  });

  return {
    audit_logs,
    areas,
    advance_amortizations,
    approval_hierarchies,
    approval_workflows,
    bank_transactions,
    business_rules,
    companies,
    cost_centers,
    currencies,
    customs_declarations,
    departments,
    exchange_rates_dof,
    installments_advances,
    invoice_adjustments,
    invoice_purchase_order,
    invoices,
    notifications,
    password_reset_tokens,
    payment_complements,
    provider_onboarding_requests,
    provider_onboarding_documents,
    provider_bank_accounts,
    positions,
    projects,
    purchase_order_lines,
    purchase_orders,
    reconciliations,
    role_permissions,
    roles,
    supplier_documents,
    suppliers,
    user_permissions,
    user_companies,
    user_sessions,
    users,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;

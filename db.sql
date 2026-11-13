-- ==============================================================================
-- MODELO DE BASE DE DATOS COMPLETO: PORTAL DE PROVEEDORES IB GROUP
-- ORDENADO CRONOLÓGICAMENTE
-- ==============================================================================

-- ==============================================================================
-- 1. PRIMER PLAN DE TRABAJO (MVP CORE)
-- ==============================================================================

-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------

-- Función: Catálogo de perfiles (Proveedor, Compras, Finanzas, Administrador).
-- Relación: Tabla base para usuarios.
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

-- Función: Almacena usuarios internos (LDAP) y externos (Proveedores con MFA).
-- Relación: Tiene un role asignado.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255), 
    is_ldap BOOLEAN DEFAULT FALSE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: Permisos granulares para acciones específicas (crear OC, aprobar factura, etc.).
-- Relación: Vinculado a roles y usuarios para control de acceso detallado.
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    permission VARCHAR(100) NOT NULL,
    permission_type VARCHAR(50) NOT NULL,
    UNIQUE (role_id, permission)
);

-- Función: Asignación de permisos a roles (M a N).
-- Relación: Vincula roles y permisos para definir capacidades de cada perfil.
CREATE TABLE role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    UNIQUE (role_id, permission_id)
);

-- Función: Asignación de permisos específicos a usuarios (excepciones).
-- Relación: Vincula usuarios y permisos para casos especiales de acceso.
CREATE TABLE user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    permission_id INT NOT NULL,
    UNIQUE (user_id, permission_id)
);

-- Función: Gestión de sesiones para usuarios autenticados (tokens, expiración, etc.).
-- Relación: Pertenece a users para controlar accesos y seguridad.
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    session_jwt_token VARCHAR(255) UNIQUE NULL,
    session_mfa_token VARCHAR(255) UNIQUE NULL,
    mfa_code_hash VARCHAR(255) NULL,
    mfa_code_expires_at TIMESTAMP NULL,
    mfa_verified_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: Log de movimientos, auditoría y dashboard de estatus.
-- Relación: Pertenece a users.
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT, 
    affected_table VARCHAR(50) NOT NULL,
    record_id INT NOT NULL,
    action VARCHAR(20) NOT NULL, 
    old_values JSONB, 
    new_values JSONB,
    source_ip VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
);

-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------
-- Semana 1 -------------------------------------------------------------------------------

-- Función: Registro maestro de proveedores (nacionales e internacionales).
-- Relación: Vinculado a users.
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    supplier_type VARCHAR(20) CHECK (supplier_type IN ('National', 'Foreign')),
    tax_id VARCHAR(50) UNIQUE NOT NULL, 
    legal_name VARCHAR(255) NOT NULL,
    sat_validation BOOLEAN DEFAULT FALSE, 
    approval_status VARCHAR(30) DEFAULT 'Pending', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: Catálogo de divisas permitidas (MXN, USD).
-- Relación: Base para tipos de cambio y transacciones.
CREATE TABLE currencies (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL, 
    name VARCHAR(50) NOT NULL
);

-- Función: Tipo de cambio diario obtenido vía integración con el DOF.
-- Relación: Vinculado a currencies.
CREATE TABLE exchange_rates_dof (
    id SERIAL PRIMARY KEY,
    currency_id INT NOT NULL,
    date DATE NOT NULL,
    rate DECIMAL(10,4) NOT NULL,
    UNIQUE (currency_id, date)
);

-- Función: Permite la gestión multiempresa (las razones sociales de IB Group).
-- Relación: Tabla maestra de operaciones.
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    tax_id VARCHAR(13) UNIQUE NOT NULL, 
    legal_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: Administración de presupuestos y departamentos. 
-- Nota: Incluye annual_budget y used_budget para soportar la validación presupuestal del Plan 2.
-- Relación: Pertenece a companies.
CREATE TABLE cost_centers (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    annual_budget DECIMAL(15,2) NOT NULL,
    used_budget DECIMAL(15,2) DEFAULT 0.00,
    auto_block BOOLEAN DEFAULT FALSE 
);

-- Función: Cabecera de las OC obtenidas vía layout de Excel o ERP.
-- Relación: Vincula companies, cost_centers, suppliers y currencies.
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    intelisis_folio VARCHAR(50) UNIQUE NOT NULL,
    company_id INT NOT NULL,
    cost_center_id INT NOT NULL,
    supplier_id INT NOT NULL,
    currency_id INT NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Active',
    issue_date DATE NOT NULL
);

-- Función: Detalle de las partidas de la OC.
-- Relación: Pertenece a purchase_orders.
CREATE TABLE purchase_order_lines (
    id SERIAL PRIMARY KEY,
    purchase_order_id INT NOT NULL,
    line_number INT NOT NULL,
    product_code VARCHAR(50) NOT NULL,
    description TEXT,
    total_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0.00,
    unit_price DECIMAL(15,2) NOT NULL
);

-- Función: Documentación del proveedor (XML, PDF, contratos).
-- Relación: Pertenece a suppliers.
CREATE TABLE supplier_documents (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL,
    document_type VARCHAR(50) NOT NULL, 
    file_path VARCHAR(500) NOT NULL,
    is_validated BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: Carga de facturas (nacional/internacional/servicio). 
-- Nota: Incluye remaining_balance para soportar el motor de saldos pendientes del Plan 2.
-- Relación: Vincula suppliers, companies y currencies.
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL,
    company_id INT NOT NULL,
    currency_id INT NOT NULL,
    invoice_type VARCHAR(20) CHECK (invoice_type IN ('National', 'Foreign', 'Service')),
    uuid VARCHAR(36), 
    foreign_folio VARCHAR(100), 
    subtotal_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    remaining_balance DECIMAL(15,2) NOT NULL, 
    xml_path VARCHAR(500), 
    pdf_path VARCHAR(500) NOT NULL, 
    status VARCHAR(50) DEFAULT 'Under Review',
    issue_date DATE NOT NULL,
    payment_calculation_date DATE, 
    sat_validation_successful BOOLEAN DEFAULT FALSE,
    CONSTRAINT unique_uuid UNIQUE (uuid),
    CONSTRAINT unique_folio_supplier UNIQUE (supplier_id, foreign_folio)
);

-- Función: Matchea las facturas con las órdenes de compra (M a N).
-- Relación: Vincula invoices y purchase_orders.
CREATE TABLE invoice_purchase_order (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL,
    purchase_order_id INT NOT NULL,
    applied_amount DECIMAL(15,2) NOT NULL 
);

-- Función: Aprobación de facturas. Flujo y estatus.
-- Relación: Pertenece a invoices y users.
CREATE TABLE approval_workflows (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL,
    reviewer_user_id INT NOT NULL,
    approval_phase VARCHAR(50) NOT NULL, 
    status VARCHAR(30) NOT NULL, 
    comments TEXT,
    review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: Pedimentos aduanales para facturas extranjeras.
-- Relación: Pertenece a invoices.
CREATE TABLE customs_declarations (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL,
    declaration_number VARCHAR(50) UNIQUE NOT NULL,
    customs_broker VARCHAR(150),
    arrival_date DATE
);

-- Función: Gestión de parcialidades y anticipos básicos.
-- Relación: Vincula purchase_orders e invoices.
CREATE TABLE installments_advances (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) CHECK (type IN ('Advance', 'Installment')),
    purchase_order_id INT, 
    invoice_id INT, 
    installment_number INT DEFAULT 1,
    amount DECIMAL(15,2) NOT NULL,
    scheduled_date DATE NOT NULL,
    payment_status VARCHAR(30) DEFAULT 'Scheduled'
);

-- Función: Carga de complementos de pago (PDF/XML).
-- Relación: Pertenece a installments_advances.
CREATE TABLE payment_complements (
    id SERIAL PRIMARY KEY,
    installment_id INT UNIQUE NOT NULL,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    xml_path VARCHAR(500) NOT NULL,
    pdf_path VARCHAR(500) NOT NULL,
    sat_validation BOOLEAN DEFAULT FALSE
);

-- Función: Alertas y notificaciones automáticas del sistema.
-- Relación: Pertenece a users.
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    alert_type VARCHAR(50) NOT NULL, 
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 2. SEGUNDO PLAN DE TRABAJO (REGLAS, ESTRUCTURA ORG, CONCILIACIÓN)
-- ==============================================================================

-- Función: (Reglas y Pagos) Jerarquías de aprobación por montos y departamentos.
-- Relación: Vincula cost_centers y roles.
CREATE TABLE approval_hierarchies (
    id SERIAL PRIMARY KEY,
    cost_center_id INT NOT NULL,
    role_id INT NOT NULL,
    min_amount DECIMAL(15,2) DEFAULT 0.00,
    max_amount DECIMAL(15,2), 
    step_order INT NOT NULL 
);

-- Función: (Reglas y Pagos) Solicitudes de anticipos vinculadas a proyectos.
-- Relación: Pertenece a companies.
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    budget DECIMAL(15,2),
    is_active BOOLEAN DEFAULT TRUE
);

-- Función: (Reglas y Pagos) Lógica de amortización: Aplicación automática de anticipos a facturas futuras.
-- Relación: Vincula installments_advances (anticipo original) e invoices (factura destino).
CREATE TABLE advance_amortizations (
    id SERIAL PRIMARY KEY,
    advance_installment_id INT NOT NULL, 
    target_invoice_id INT NOT NULL, 
    applied_amount DECIMAL(15,2) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: (Reglas y Pagos) Reglas comerciales completas.
-- Relación: Pertenece a suppliers.
CREATE TABLE business_rules (
    id SERIAL PRIMARY KEY,
    supplier_id INT UNIQUE NOT NULL,
    payment_terms_days INT DEFAULT 30,
    credit_limit DECIMAL(15,2),
    advance_payment_percentage DECIMAL(5,2) DEFAULT 0.00,
    early_payment_discount_pct DECIMAL(5,2) DEFAULT 0.00, 
    penalty_active BOOLEAN DEFAULT FALSE
);

-- Función: (Reglas y Pagos) Calculadora de descuentos por pronto pago y penalizaciones comerciales.
-- Relación: Pertenece a invoices.
CREATE TABLE invoice_adjustments (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL,
    adjustment_type VARCHAR(20) CHECK (adjustment_type IN ('Discount', 'Penalty')),
    amount DECIMAL(15,2) NOT NULL,
    description VARCHAR(255),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: (Integración y Conc.) Registro de log detallado para errores de comunicación con el ERP.
-- Relación: Pertenece a companies.
CREATE TABLE erp_sync_logs (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    entity_type VARCHAR(50) NOT NULL, 
    entity_id INT,
    sync_direction VARCHAR(20) CHECK (sync_direction IN ('INBOUND', 'OUTBOUND')),
    status VARCHAR(20) CHECK (status IN ('SUCCESS', 'ERROR')),
    error_message TEXT,
    payload JSONB, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Función: (Integración y Conc.) Datos del banco para conciliación.
-- Relación: Pertenece a companies.
CREATE TABLE bank_transactions (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    account_number VARCHAR(50),
    transaction_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    reference VARCHAR(255),
    is_reconciled BOOLEAN DEFAULT FALSE
);

-- Función: (Integración y Conc.) Algoritmo de conciliación automática: Factura vs. Pago Bancario vs. Sistema.
-- Relación: Vincula invoices, bank_transactions y users.
CREATE TABLE reconciliations (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL,
    bank_transaction_id INT NOT NULL,
    reconciled_by_user_id INT, 
    reconciliation_type VARCHAR(20) CHECK (reconciliation_type IN ('MANUAL', 'AUTOMATIC')),
    status VARCHAR(30) DEFAULT 'Reconciled',
    discrepancy_amount DECIMAL(15,2) DEFAULT 0.00, 
    discrepancy_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 3. LLAVES FORÁNEAS (CREADAS AL FINAL PARA EVITAR ERRORES DE REFERENCIA)
-- ==============================================================================

-- FKs del PLAN 1
ALTER TABLE users ADD CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE suppliers ADD CONSTRAINT fk_supplier_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE exchange_rates_dof ADD CONSTRAINT fk_exchange_currency FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE cost_centers ADD CONSTRAINT fk_cc_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE purchase_orders ADD CONSTRAINT fk_po_company FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE purchase_orders ADD CONSTRAINT fk_po_cc FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id);
ALTER TABLE purchase_orders ADD CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE purchase_orders ADD CONSTRAINT fk_po_currency FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE purchase_order_lines ADD CONSTRAINT fk_poline_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);

ALTER TABLE supplier_documents ADD CONSTRAINT fk_docs_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

ALTER TABLE invoices ADD CONSTRAINT fk_inv_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE invoices ADD CONSTRAINT fk_inv_company FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE invoices ADD CONSTRAINT fk_inv_currency FOREIGN KEY (currency_id) REFERENCES currencies(id);

ALTER TABLE invoice_purchase_order ADD CONSTRAINT fk_ipo_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE invoice_purchase_order ADD CONSTRAINT fk_ipo_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);

ALTER TABLE approval_workflows ADD CONSTRAINT fk_aw_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE approval_workflows ADD CONSTRAINT fk_aw_user FOREIGN KEY (reviewer_user_id) REFERENCES users(id);
ALTER TABLE customs_declarations ADD CONSTRAINT fk_cd_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);

ALTER TABLE installments_advances ADD CONSTRAINT fk_ia_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE installments_advances ADD CONSTRAINT fk_ia_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE payment_complements ADD CONSTRAINT fk_pc_installment FOREIGN KEY (installment_id) REFERENCES installments_advances(id);

ALTER TABLE notifications ADD CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id);

-- FKs del PLAN 2
ALTER TABLE approval_hierarchies ADD CONSTRAINT fk_ah_cc FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id);
ALTER TABLE approval_hierarchies ADD CONSTRAINT fk_ah_role FOREIGN KEY (role_id) REFERENCES roles(id);

ALTER TABLE projects ADD CONSTRAINT fk_proj_company FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE advance_amortizations ADD CONSTRAINT fk_aa_advance FOREIGN KEY (advance_installment_id) REFERENCES installments_advances(id);
ALTER TABLE advance_amortizations ADD CONSTRAINT fk_aa_invoice FOREIGN KEY (target_invoice_id) REFERENCES invoices(id);

ALTER TABLE business_rules ADD CONSTRAINT fk_rules_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE invoice_adjustments ADD CONSTRAINT fk_adj_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);

ALTER TABLE erp_sync_logs ADD CONSTRAINT fk_esl_company FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE bank_transactions ADD CONSTRAINT fk_bt_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE reconciliations ADD CONSTRAINT fk_rec_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE reconciliations ADD CONSTRAINT fk_rec_bt FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id);
ALTER TABLE reconciliations ADD CONSTRAINT fk_rec_user FOREIGN KEY (reconciled_by_user_id) REFERENCES users(id);

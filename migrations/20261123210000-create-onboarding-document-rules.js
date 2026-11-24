"use strict";
const rules = [
  ["csf","Constancia de situación fiscal","nacional",["fisica","moral","gob"],1,0,"1 mes","Cuentas por Pagar"],
  ["ine","Identificación oficial vigente","ambos",["fisica","moral","internacional"],1,0,"Configuración manual","Legal"],
  ["edocta","Carátula de estado de cuenta bancario","nacional",["fisica","moral","gob"],1,1,"3 meses","Tesorería"],
  ["opinion","Opinión de cumplimiento SAT (32-D)","nacional",["fisica","moral"],1,0,"1 mes","Cuentas por Pagar"],
  ["domicilio","Comprobante de domicilio","ambos",["fisica","moral","internacional"],1,0,"3 meses","Contabilidad"],
  ["poder","Poder notarial del Representante Legal","nacional",["moral"],1,0,"Indefinida","Legal"],
  ["acta","Acta constitutiva","nacional",["moral"],1,0,"Indefinida","Legal"],
  ["valrfc","Validación del RFC ante el SAT","nacional",["gob"],1,0,"1 mes","Cuentas por Pagar"],
  ["cuenta","Documento de cuenta bancaria o línea de captura","nacional",["gob"],1,0,"Configuración manual","Tesorería"],
  ["repse","Folio de registro REPSE","nacional",["fisica","moral"],0,0,"1 mes","Legal"],
  ["certmarca","Certificado de proveedor autorizado por la marca","nacional",["moral"],0,1,"1 año","Compras"],
  ["incorp","Certificate of Incorporation","internacional",["internacional"],1,0,"Indefinida","Legal"],
  ["taxcert","Constancia fiscal del extranjero","internacional",["internacional"],1,0,"1 año","Cuentas por Pagar"],
  ["bank","Certificado de cuenta bancaria / IBAN / SWIFT","internacional",["internacional"],1,1,"3 meses","Tesorería"],
  ["contrato","Contrato marco firmado vigente","ambos",["fisica","moral","internacional"],0,1,"Configuración manual","Legal",null,1],
  ["anexo","Anexo o adenda al contrato","ambos",["fisica","moral","internacional"],0,1,"Configuración manual","Legal","contrato",0],
];
module.exports = { async up(q, S) { await q.createTable("onboarding_document_rules", { id:{type:S.BIGINT.UNSIGNED,autoIncrement:true,primaryKey:true}, code:{type:S.STRING(50),allowNull:false,unique:true}, name:{type:S.STRING(255),allowNull:false}, scope:{type:S.ENUM("nacional","internacional","ambos"),allowNull:false}, person_types:{type:S.JSON,allowNull:false}, required:{type:S.BOOLEAN,allowNull:false,defaultValue:true}, multiple:{type:S.BOOLEAN,allowNull:false,defaultValue:false}, validity:{type:S.STRING(50),allowNull:false}, validator_role:{type:S.STRING(100),allowNull:false}, parent_code:{type:S.STRING(50),allowNull:true}, is_contract:{type:S.BOOLEAN,allowNull:false,defaultValue:false}, active:{type:S.BOOLEAN,allowNull:false,defaultValue:true}, sort_order:{type:S.INTEGER,allowNull:false,defaultValue:0}, created_at:{type:S.DATE,allowNull:false,defaultValue:S.literal("CURRENT_TIMESTAMP")}, updated_at:{type:S.DATE,allowNull:false,defaultValue:S.literal("CURRENT_TIMESTAMP")}, deleted_at:{type:S.DATE,allowNull:true} }); await q.bulkInsert("onboarding_document_rules", rules.map((r,i)=>({code:r[0],name:r[1],scope:r[2],person_types:JSON.stringify(r[3]),required:r[4],multiple:r[5],validity:r[6],validator_role:r[7],parent_code:r[8]||null,is_contract:Boolean(r[9]),active:true,sort_order:i+1,created_at:new Date(),updated_at:new Date()}))); }, async down(q){await q.dropTable("onboarding_document_rules");} };

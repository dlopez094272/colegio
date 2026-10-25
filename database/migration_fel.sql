-- =====================================================================
--  Recibo electrónico SAT (FEL, documento tipo RECI)
--    configuracion  → apartado FEL: certificador, credenciales (cifradas),
--                     URLs del servicio, datos del emisor y consulta de NIT
--    pagos          → resultado de la certificación de cada recibo
--    fel_log        → XML, petición y respuesta de cada envío al certificador
-- =====================================================================
USE colegio;

ALTER TABLE configuracion
  ADD COLUMN fel_habilitado            TINYINT(1)   NOT NULL DEFAULT 0 AFTER notificar_pago,
  ADD COLUMN fel_certificador          VARCHAR(20)  NULL COMMENT 'INFILE | GRUPO CDS' AFTER fel_habilitado,
  ADD COLUMN fel_certificador_nit      VARCHAR(20)  NULL COMMENT 'Se imprime en el recibo (representación gráfica)' AFTER fel_certificador,
  ADD COLUMN fel_usuario               VARCHAR(100) NULL COMMENT 'INFILE: usuario del WS de certificación' AFTER fel_certificador_nit,
  ADD COLUMN fel_alias                 VARCHAR(100) NULL COMMENT 'INFILE: alias del firmador' AFTER fel_usuario,
  ADD COLUMN fel_token                 VARCHAR(1000) NULL COMMENT 'Cifrado. INFILE: llave de firma · GRUPO CDS: apiKey' AFTER fel_alias,
  ADD COLUMN fel_llave                 VARCHAR(1000) NULL COMMENT 'Cifrado. INFILE: llave del WS de certificación' AFTER fel_token,
  ADD COLUMN fel_url_firma             VARCHAR(250) NULL AFTER fel_llave,
  ADD COLUMN fel_url_certificacion     VARCHAR(250) NULL AFTER fel_url_firma,
  ADD COLUMN fel_url_anulacion         VARCHAR(250) NULL AFTER fel_url_certificacion,
  ADD COLUMN fel_url_firma_anulacion   VARCHAR(250) NULL COMMENT 'GRUPO CDS: firma de la anulación' AFTER fel_url_anulacion,
  ADD COLUMN fel_nit_emisor            VARCHAR(20)  NULL COMMENT 'Vacío = NIT de datos generales' AFTER fel_url_firma_anulacion,
  ADD COLUMN fel_nombre_emisor         VARCHAR(150) NULL COMMENT 'Razón social registrada en SAT' AFTER fel_nit_emisor,
  ADD COLUMN fel_nombre_comercial      VARCHAR(150) NULL COMMENT 'Vacío = nombre del colegio' AFTER fel_nombre_emisor,
  ADD COLUMN fel_codigo_establecimiento VARCHAR(5)  NOT NULL DEFAULT '1' AFTER fel_nombre_comercial,
  ADD COLUMN fel_afiliacion_iva        VARCHAR(10)  NOT NULL DEFAULT 'GEN' AFTER fel_codigo_establecimiento,
  ADD COLUMN fel_codigo_postal         VARCHAR(10)  NOT NULL DEFAULT '01001' AFTER fel_afiliacion_iva,
  ADD COLUMN fel_frases                VARCHAR(100) NULL COMMENT 'tipo,escenario;tipo,escenario (vacío = sin frases)' AFTER fel_codigo_postal,
  ADD COLUMN fel_emitir_pago           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Valor por defecto de "Emitir recibo electrónico" al cobrar' AFTER fel_frases,
  ADD COLUMN fel_activar_log           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Guardar en fel_log también los envíos exitosos' AFTER fel_emitir_pago,
  ADD COLUMN nit_consulta_url          VARCHAR(250) NULL COMMENT 'Consulta de nombre por NIT; el NIT se agrega al final' AFTER fel_activar_log,
  ADD COLUMN nit_consulta_key          VARCHAR(1000) NULL COMMENT 'Cifrado. Header appKey' AFTER nit_consulta_url;

ALTER TABLE pagos
  ADD COLUMN fel_estado              VARCHAR(20)  NULL COMMENT 'NULL = no emitido | Certificado | Error | Anulado | Error al anular' AFTER fecha_anulacion,
  ADD COLUMN fel_serie               VARCHAR(30)  NULL AFTER fel_estado,
  ADD COLUMN fel_numero              VARCHAR(30)  NULL AFTER fel_serie,
  ADD COLUMN fel_uuid                VARCHAR(50)  NULL COMMENT 'Número de autorización' AFTER fel_numero,
  ADD COLUMN fel_fecha_emision       VARCHAR(35)  NULL COMMENT 'FechaHoraEmision enviada (se repite en la anulación)' AFTER fel_uuid,
  ADD COLUMN fel_fecha_certificacion DATETIME     NULL AFTER fel_fecha_emision,
  ADD COLUMN fel_id_receptor         VARCHAR(20)  NULL COMMENT 'NIT/CUI con que se certificó' AFTER fel_fecha_certificacion,
  ADD COLUMN fel_mensaje             VARCHAR(500) NULL COMMENT 'Respuesta o error del certificador' AFTER fel_id_receptor,
  ADD KEY idx_pago_fel (fel_estado);

CREATE TABLE IF NOT EXISTS fel_log (
  idfel_log   INT         NOT NULL AUTO_INCREMENT,
  fecha       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idusuarios  INT         NULL,
  idpagos     INT         NULL,
  tipo        VARCHAR(10) NOT NULL COMMENT 'RECI | ANUL',
  exito       TINYINT(1)  NOT NULL DEFAULT 0,
  xml         MEDIUMTEXT  NULL,
  firma       MEDIUMTEXT  NULL COMMENT 'Respuesta del firmador (sin el XML firmado)',
  respuesta   MEDIUMTEXT  NULL COMMENT 'Respuesta del certificador',
  PRIMARY KEY (idfel_log),
  KEY idx_fel_log_pago (idpagos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

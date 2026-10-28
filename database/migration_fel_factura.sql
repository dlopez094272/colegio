-- =====================================================================
--  Recibo y factura electrónica por pago
--    SAT solo permite a los centros educativos emitir recibo (RECI) por
--    inscripción y colegiatura. La mora (recargo calculado por el sistema)
--    y las demás cuotas se documentan con factura electrónica (FACT/FPEQ).
--
--    cuotas.emite_recibo        → qué cuotas van en el recibo electrónico
--    pagos_detalle.emite_recibo → copia al cobrar (cambiar la cuota después
--                                 no altera los pagos ya registrados)
--    pagos_fel                  → un documento electrónico por tipo y pago;
--                                 reemplaza las columnas pagos.fel_*
--    configuracion              → frases de la factura (distintas a las del recibo)
-- =====================================================================
USE colegio;

ALTER TABLE cuotas
  ADD COLUMN emite_recibo TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = se documenta con recibo electrónico (inscripción, colegiatura); 0 = con factura'
    AFTER obligatoria;

-- Inscripción y colegiatura emiten recibo; revisar el resto en Finanzas › Cuotas
UPDATE cuotas SET emite_recibo = 1
 WHERE cuota LIKE '%inscrip%' OR cuota LIKE '%mensualidad%' OR cuota LIKE '%colegiatura%';

ALTER TABLE pagos_detalle
  ADD COLUMN emite_recibo TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Copia de cuotas.emite_recibo al cobrar. La mora siempre va en la factura'
    AFTER mora_exonerada;

UPDATE pagos_detalle pd
  JOIN inscripciones_cargos ic ON ic.idinscripciones_cargos = pd.idinscripciones_cargos
  JOIN cuotas_ciclos cc ON cc.idcuotas_ciclos = ic.idcuotas_ciclos
  JOIN cuotas cu ON cu.idcuotas = cc.idcuotas
   SET pd.emite_recibo = cu.emite_recibo;

CREATE TABLE IF NOT EXISTS pagos_fel (
  idpagos_fel         INT           NOT NULL AUTO_INCREMENT,
  idpagos             INT           NOT NULL,
  tipo                VARCHAR(4)    NOT NULL COMMENT 'RECI | FACT',
  estado              VARCHAR(20)   NOT NULL DEFAULT 'Pendiente' COMMENT 'Pendiente | Procesando | Certificado | Error | Anulado | Error al anular',
  dte                 VARCHAR(4)    NULL COMMENT 'Tipo de DTE enviado: RECI | FACT | FPEQ',
  total               DECIMAL(10,2) NULL COMMENT 'Total certificado',
  iva                 DECIMAL(10,2) NULL COMMENT 'IVA incluido en el total (factura)',
  serie               VARCHAR(30)   NULL,
  numero              VARCHAR(30)   NULL,
  uuid                VARCHAR(50)   NULL COMMENT 'Número de autorización',
  fecha_emision       VARCHAR(35)   NULL COMMENT 'FechaHoraEmision enviada (se repite en la anulación)',
  fecha_certificacion DATETIME      NULL COMMENT 'Mientras está Procesando: hora del intento',
  id_receptor         VARCHAR(20)   NULL COMMENT 'NIT/CUI con que se certificó',
  mensaje             VARCHAR(500)  NULL COMMENT 'Respuesta o error del certificador',
  PRIMARY KEY (idpagos_fel),
  UNIQUE KEY uq_pago_fel (idpagos, tipo),
  KEY idx_pago_fel_estado (estado),
  CONSTRAINT fk_pago_fel_pago FOREIGN KEY (idpagos) REFERENCES pagos (idpagos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recibos electrónicos ya emitidos ante SAT (antes la mora iba dentro del recibo).
-- Los intentos con error no se pasan: se reintentan ya separados en recibo y factura.
INSERT INTO pagos_fel (idpagos, tipo, estado, dte, total, serie, numero, uuid, fecha_emision, fecha_certificacion, id_receptor, mensaje)
SELECT idpagos, 'RECI', fel_estado, 'RECI', total, fel_serie, fel_numero, fel_uuid, fel_fecha_emision, fel_fecha_certificacion, fel_id_receptor, fel_mensaje
  FROM pagos WHERE fel_uuid IS NOT NULL;

ALTER TABLE pagos
  DROP INDEX idx_pago_fel,
  DROP COLUMN fel_estado, DROP COLUMN fel_serie, DROP COLUMN fel_numero, DROP COLUMN fel_uuid,
  DROP COLUMN fel_fecha_emision, DROP COLUMN fel_fecha_certificacion, DROP COLUMN fel_id_receptor, DROP COLUMN fel_mensaje;

ALTER TABLE fel_log
  MODIFY COLUMN tipo VARCHAR(10) NOT NULL COMMENT 'RECI | FACT | ANUL-RECI | ANUL-FACT';

ALTER TABLE configuracion
  ADD COLUMN fel_frases_factura VARCHAR(100) NULL COMMENT 'Frases de la factura: tipo,escenario;tipo,escenario' AFTER fel_frases;

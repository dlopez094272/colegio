-- =====================================================================
--  Inscripciones, estado de cuenta (cargos) y pagos
--    inscripciones         → estudiante + grado (+ sección) en un ciclo, con
--                            código propio y contrato firmado (storage privado)
--    inscripciones_cargos  → copia (snapshot) de las cuotas del ciclo al
--                            inscribir: monto, vencimiento y mora de cada cobro
--    pagos / pagos_detalle → recibos; cada línea liquida un cargo completo
-- =====================================================================
USE colegio;

-- Correlativos (código de inscripción por ciclo, número de recibo).
CREATE TABLE IF NOT EXISTS correlativos (
  serie   VARCHAR(30) NOT NULL,
  ultimo  INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (serie)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inscripciones (
  idinscripciones     INT          NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(20)  NOT NULL COMMENT 'Ej. INS-2026-0001 (correlativo por ciclo)',
  ciclo               SMALLINT     NOT NULL,
  idestudiantes       INT          NOT NULL,
  idgrados            INT          NOT NULL COMMENT 'Nivel y carrera se derivan del grado',
  idsecciones         INT          NULL,
  idpadres            INT          NULL COMMENT 'Encargado que firma el contrato',
  fecha_inscripcion   DATE         NOT NULL,
  estado              VARCHAR(10)  NOT NULL DEFAULT 'Activa' COMMENT 'Activa | Anulada',
  observaciones       VARCHAR(255) NULL,
  -- Contrato firmado (escaneado): storage/<tenant>/inscripciones/<id>/...
  contrato_archivo    VARCHAR(255) NULL,
  contrato_nombre     VARCHAR(255) NULL,
  contrato_mime       VARCHAR(150) NULL,
  contrato_fecha      DATETIME     NULL,
  motivo_anulacion    VARCHAR(255) NULL,
  fecha_anulacion     DATETIME     NULL,
  idusuarios          INT          NULL,
  fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_modificacion  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  -- Un estudiante solo puede tener una inscripción activa por ciclo
  activa_estudiante   INT GENERATED ALWAYS AS (IF(estado = 'Activa', idestudiantes, NULL)) STORED,
  PRIMARY KEY (idinscripciones),
  UNIQUE KEY uq_insc_codigo (codigo),
  UNIQUE KEY uq_insc_activa (ciclo, activa_estudiante),
  KEY idx_insc_estudiante (idestudiantes),
  KEY idx_insc_grado (idgrados),
  KEY idx_insc_seccion (idsecciones),
  KEY idx_insc_padre (idpadres),
  CONSTRAINT fk_insc_estudiante FOREIGN KEY (idestudiantes) REFERENCES estudiantes (idestudiantes),
  CONSTRAINT fk_insc_grado      FOREIGN KEY (idgrados)      REFERENCES grados (idgrados),
  CONSTRAINT fk_insc_seccion    FOREIGN KEY (idsecciones)   REFERENCES secciones (idsecciones),
  CONSTRAINT fk_insc_padre      FOREIGN KEY (idpadres)      REFERENCES padres (idpadres) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cobros del estudiante. Se copian de cuotas_ciclos/cuotas_grados al inscribir,
-- así un cambio posterior de montos no altera lo ya pactado en el contrato.
CREATE TABLE IF NOT EXISTS inscripciones_cargos (
  idinscripciones_cargos INT           NOT NULL AUTO_INCREMENT,
  idinscripciones        INT           NOT NULL,
  idcuotas_ciclos        INT           NOT NULL,
  numero_cobro           TINYINT       NOT NULL DEFAULT 1 COMMENT 'Mensual: 1..12; Única: 1',
  concepto               VARCHAR(150)  NOT NULL COMMENT 'Ej. Mensualidad — Febrero 2026',
  fecha_vencimiento      DATE          NOT NULL,
  monto                  DECIMAL(10,2) NOT NULL,
  mora_tipo              VARCHAR(12)   NOT NULL DEFAULT 'Ninguna',
  mora_valor             DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado                 VARCHAR(10)   NOT NULL DEFAULT 'Pendiente' COMMENT 'Pendiente | Pagado | Anulado',
  motivo_anulacion       VARCHAR(255)  NULL,
  PRIMARY KEY (idinscripciones_cargos),
  UNIQUE KEY uq_cargo (idinscripciones, idcuotas_ciclos, numero_cobro),
  KEY idx_cargo_cc (idcuotas_ciclos),
  KEY idx_cargo_estado (estado, fecha_vencimiento),
  CONSTRAINT fk_cargo_insc FOREIGN KEY (idinscripciones) REFERENCES inscripciones (idinscripciones),
  CONSTRAINT fk_cargo_cc   FOREIGN KEY (idcuotas_ciclos) REFERENCES cuotas_ciclos (idcuotas_ciclos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos (
  idpagos           INT           NOT NULL AUTO_INCREMENT,
  numero            INT           NOT NULL COMMENT 'Número de recibo (correlativo)',
  fecha_pago        DATE          NOT NULL,
  idpadres          INT           NULL COMMENT 'Padre/encargado que paga (opcional)',
  pagador_nombre    VARCHAR(150)  NOT NULL,
  pagador_nit       VARCHAR(20)   NOT NULL DEFAULT 'CF',
  forma_pago        VARCHAR(20)   NOT NULL DEFAULT 'Efectivo' COMMENT 'Efectivo | Depósito | Transferencia | Tarjeta | Cheque',
  referencia        VARCHAR(60)   NULL COMMENT 'No. de boleta, autorización o cheque',
  observaciones     VARCHAR(255)  NULL,
  subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0,
  mora              DECIMAL(10,2) NOT NULL DEFAULT 0,
  total             DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado            VARCHAR(10)   NOT NULL DEFAULT 'Activo' COMMENT 'Activo | Anulado',
  motivo_anulacion  VARCHAR(255)  NULL,
  fecha_anulacion   DATETIME      NULL,
  idusuarios        INT           NULL,
  fecha_creacion    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idpagos),
  UNIQUE KEY uq_pago_numero (numero),
  KEY idx_pago_fecha (fecha_pago),
  KEY idx_pago_padre (idpadres),
  CONSTRAINT fk_pago_padre FOREIGN KEY (idpadres) REFERENCES padres (idpadres) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos_detalle (
  idpagos_detalle        INT           NOT NULL AUTO_INCREMENT,
  idpagos                INT           NOT NULL,
  idinscripciones_cargos INT           NOT NULL,
  monto                  DECIMAL(10,2) NOT NULL,
  mora                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  mora_exonerada         TINYINT(1)    NOT NULL DEFAULT 0,
  total                  DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (idpagos_detalle),
  KEY idx_pd_pago (idpagos),
  KEY idx_pd_cargo (idinscripciones_cargos),
  CONSTRAINT fk_pd_pago  FOREIGN KEY (idpagos)                REFERENCES pagos (idpagos),
  CONSTRAINT fk_pd_cargo FOREIGN KEY (idinscripciones_cargos) REFERENCES inscripciones_cargos (idinscripciones_cargos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask) VALUES
  ('inscripciones', 1, 'AESP'),
  ('pagos',         1, 'ASP')
ON DUPLICATE KEY UPDATE AccessMask = VALUES(AccessMask);

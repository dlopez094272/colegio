-- =====================================================================
--  Cuotas: catálogo global (Inscripción, Mensualidad, Bus...) que se
--  configura por ciclo escolar (fechas, día límite, mora) y se asigna a
--  cada grado con su propio monto. Sin fila en cuotas_grados = la cuota
--  no aplica a ese grado.
-- =====================================================================
USE colegio;

CREATE TABLE IF NOT EXISTS cuotas (
  idcuotas      INT          NOT NULL AUTO_INCREMENT,
  cuota         VARCHAR(100) NOT NULL,
  descripcion   VARCHAR(255) NULL,
  periodicidad  VARCHAR(10)  NOT NULL DEFAULT 'Unica' COMMENT 'Unica | Mensual',
  obligatoria   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = opcional: solo la pagan los estudiantes que la tomen',
  orden         INT          NOT NULL DEFAULT 0,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (idcuotas),
  UNIQUE KEY uq_cuota (cuota)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Configuración de la cuota en un ciclo escolar (año).
--   Mensual: un cobro por mes entre fecha_inicio y fecha_fin, cada uno vence el dia_limite del mes.
--   Única:   un solo cobro, se paga entre fecha_inicio y fecha_fin (fecha_fin es la fecha límite).
CREATE TABLE IF NOT EXISTS cuotas_ciclos (
  idcuotas_ciclos INT           NOT NULL AUTO_INCREMENT,
  idcuotas        INT           NOT NULL,
  ciclo           SMALLINT      NOT NULL COMMENT 'Año del ciclo escolar',
  fecha_inicio    DATE          NOT NULL,
  fecha_fin       DATE          NOT NULL,
  dia_limite      TINYINT       NOT NULL DEFAULT 5 COMMENT 'Mensual: día del mes en que vence cada cobro',
  mora_tipo       VARCHAR(12)   NOT NULL DEFAULT 'Ninguna' COMMENT 'Ninguna | Monto | Porcentaje',
  mora_valor      DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Q fijos o % del cobro vencido',
  PRIMARY KEY (idcuotas_ciclos),
  UNIQUE KEY uq_cuota_ciclo (idcuotas, ciclo),
  KEY idx_cc_ciclo (ciclo),
  CONSTRAINT fk_cc_cuota FOREIGN KEY (idcuotas) REFERENCES cuotas (idcuotas)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cuotas_grados (
  idcuotas_grados INT           NOT NULL AUTO_INCREMENT,
  idcuotas_ciclos INT           NOT NULL,
  idgrados        INT           NOT NULL,
  monto           DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (idcuotas_grados),
  UNIQUE KEY uq_cg (idcuotas_ciclos, idgrados),
  KEY idx_cg_grado (idgrados),
  CONSTRAINT fk_cg_cuota_ciclo FOREIGN KEY (idcuotas_ciclos) REFERENCES cuotas_ciclos (idcuotas_ciclos) ON DELETE CASCADE,
  CONSTRAINT fk_cg_grado       FOREIGN KEY (idgrados)        REFERENCES grados (idgrados)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cuotas (cuota, descripcion, periodicidad, obligatoria, orden) VALUES
  ('Inscripción',  'Pago anual de inscripción', 'Unica',   1, 1),
  ('Mensualidad',  'Colegiatura mensual',       'Mensual', 1, 2)
ON DUPLICATE KEY UPDATE cuota = VALUES(cuota);

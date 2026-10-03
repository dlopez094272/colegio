-- =====================================================================
--  Estructura académica: Nivel → (Carrera) → Grado → Sección
--  Inactivar/activar un registro arrastra a todos sus descendientes.
-- =====================================================================
USE colegio;

CREATE TABLE IF NOT EXISTS niveles (
  idniveles     INT         NOT NULL AUTO_INCREMENT,
  nivel         VARCHAR(80) NOT NULL,
  usa_carreras  TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '1 = sus grados se agrupan por carrera (ej. Diversificado)',
  orden         INT         NOT NULL DEFAULT 0,
  activo        TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (idniveles),
  UNIQUE KEY uq_nivel (nivel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carreras (
  idcarreras    INT          NOT NULL AUTO_INCREMENT,
  idniveles     INT          NOT NULL,
  carrera       VARCHAR(120) NOT NULL,
  orden         INT          NOT NULL DEFAULT 0,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (idcarreras),
  UNIQUE KEY uq_carrera (idniveles, carrera),
  CONSTRAINT fk_carrera_nivel FOREIGN KEY (idniveles) REFERENCES niveles (idniveles)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grados (
  idgrados      INT         NOT NULL AUTO_INCREMENT,
  idniveles     INT         NOT NULL,
  idcarreras    INT         NULL COMMENT 'Solo cuando el nivel usa carreras',
  grado         VARCHAR(80) NOT NULL,
  orden         INT         NOT NULL DEFAULT 0,
  activo        TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (idgrados),
  KEY idx_grado_nivel (idniveles),
  KEY idx_grado_carrera (idcarreras),
  CONSTRAINT fk_grado_nivel   FOREIGN KEY (idniveles)  REFERENCES niveles (idniveles),
  CONSTRAINT fk_grado_carrera FOREIGN KEY (idcarreras) REFERENCES carreras (idcarreras)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS secciones (
  idsecciones   INT         NOT NULL AUTO_INCREMENT,
  idgrados      INT         NOT NULL,
  seccion       VARCHAR(40) NOT NULL,
  activo        TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (idsecciones),
  UNIQUE KEY uq_seccion (idgrados, seccion),
  CONSTRAINT fk_seccion_grado FOREIGN KEY (idgrados) REFERENCES grados (idgrados)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO niveles (nivel, usa_carreras, orden) VALUES
  ('Preprimaria',   0, 1),
  ('Primaria',      0, 2),
  ('Básico',        0, 3),
  ('Diversificado', 1, 4)
ON DUPLICATE KEY UPDATE nivel = VALUES(nivel);

INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask) VALUES
  ('estructura_academica', 1, 'S')
ON DUPLICATE KEY UPDATE AccessMask = VALUES(AccessMask);

-- =====================================================================
--  Personal docente (maestros y coordinadores) + catálogo de
--  formaciones académicas (un docente puede tener varias)
-- =====================================================================
USE colegio;

CREATE TABLE IF NOT EXISTS formaciones_academicas (
  idformaciones_academicas INT          NOT NULL AUTO_INCREMENT,
  formacion                VARCHAR(150) NOT NULL,
  activo                   TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (idformaciones_academicas),
  UNIQUE KEY uq_formacion (formacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS docentes (
  iddocentes          INT          NOT NULL AUTO_INCREMENT,
  tipo_personal       VARCHAR(20)  NOT NULL DEFAULT 'Maestro' COMMENT 'Maestro | Coordinador',
  primer_nombre       VARCHAR(60)  NOT NULL,
  segundo_nombre      VARCHAR(60)  NULL,
  primer_apellido     VARCHAR(60)  NOT NULL,
  segundo_apellido    VARCHAR(60)  NULL,
  apellido_casada     VARCHAR(60)  NULL,
  fecha_nacimiento    DATE         NULL,
  idestados_civiles   INT          NULL,
  nit                 VARCHAR(20)  NULL,
  dpi                 VARCHAR(20)  NULL,
  pasaporte           VARCHAR(30)  NULL,
  direccion           VARCHAR(300) NULL,
  telefono_casa       VARCHAR(20)  NULL,
  telefono_celular    VARCHAR(20)  NULL,
  email               VARCHAR(145) NULL,
  fecha_ingreso       DATE         NULL COMMENT 'Fecha de ingreso a la institución',
  foto                VARCHAR(255) NULL COMMENT 'Ruta relativa: files/<tenant>/docentes/<archivo>.jpg',
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  idusuarios          INT          NULL COMMENT 'Usuario que registró',
  fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_modificacion  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (iddocentes),
  KEY idx_docentes_dpi (dpi),
  KEY idx_docentes_tipo (tipo_personal),
  KEY idx_docentes_apellidos (primer_apellido, segundo_apellido),
  CONSTRAINT fk_docentes_estado_civil FOREIGN KEY (idestados_civiles)
    REFERENCES estados_civiles (idestados_civiles)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS docentes_formaciones (
  iddocentes               INT NOT NULL,
  idformaciones_academicas INT NOT NULL,
  PRIMARY KEY (iddocentes, idformaciones_academicas),
  KEY idx_df_formacion (idformaciones_academicas),
  CONSTRAINT fk_df_docente   FOREIGN KEY (iddocentes)
    REFERENCES docentes (iddocentes) ON DELETE CASCADE,
  CONSTRAINT fk_df_formacion FOREIGN KEY (idformaciones_academicas)
    REFERENCES formaciones_academicas (idformaciones_academicas)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO formaciones_academicas (formacion) VALUES
  ('Maestro(a) de Educación Primaria Urbana'),
  ('Maestro(a) de Educación Preprimaria'),
  ('Profesorado de Enseñanza Media'),
  ('Licenciatura en Pedagogía'),
  ('Licenciatura en Educación'),
  ('Licenciatura en Matemática'),
  ('Licenciatura en Letras'),
  ('Ingeniería en Sistemas'),
  ('Maestría en Educación'),
  ('Doctorado en Educación')
ON DUPLICATE KEY UPDATE formacion = VALUES(formacion);

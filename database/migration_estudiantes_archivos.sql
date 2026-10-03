-- =====================================================================
--  Estudiantes: expediente de archivos por categoría
--  (Partida de nacimiento, certificados, constancias, etc.)
-- =====================================================================
USE colegio;

CREATE TABLE IF NOT EXISTS categorias_archivos (
  idcategorias_archivos INT         NOT NULL AUTO_INCREMENT,
  categoria             VARCHAR(80) NOT NULL,
  activo                TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (idcategorias_archivos),
  UNIQUE KEY uq_categoria_archivo (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS estudiantes_archivos (
  idestudiantes_archivos INT          NOT NULL AUTO_INCREMENT,
  idestudiantes          INT          NOT NULL,
  idcategorias_archivos  INT          NOT NULL,
  nombre_original        VARCHAR(255) NOT NULL,
  archivo                VARCHAR(255) NOT NULL COMMENT 'Ruta relativa dentro de storage/<tenant>/ (no pública)',
  mime                   VARCHAR(150) NULL,
  tamano                 INT          NOT NULL DEFAULT 0 COMMENT 'Bytes',
  observaciones          VARCHAR(255) NULL,
  idusuarios             INT          NULL COMMENT 'Usuario que subió el archivo',
  fecha_creacion         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idestudiantes_archivos),
  KEY idx_ea_estudiante (idestudiantes),
  KEY idx_ea_categoria (idcategorias_archivos),
  CONSTRAINT fk_ea_estudiante FOREIGN KEY (idestudiantes)
    REFERENCES estudiantes (idestudiantes) ON DELETE CASCADE,
  CONSTRAINT fk_ea_categoria FOREIGN KEY (idcategorias_archivos)
    REFERENCES categorias_archivos (idcategorias_archivos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO categorias_archivos (categoria) VALUES
  ('Partida de nacimiento'),
  ('Certificado de estudios'),
  ('Constancia de vacunación'),
  ('Fotocopia de DPI del encargado'),
  ('Solvencia'),
  ('Otro')
ON DUPLICATE KEY UPDATE categoria = VALUES(categoria);

INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask) VALUES
  ('categorias_archivos', 1, 'S')
ON DUPLICATE KEY UPDATE AccessMask = VALUES(AccessMask);

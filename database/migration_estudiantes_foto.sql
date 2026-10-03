-- =====================================================================
--  Estudiantes: lugar de nacimiento y fotografía
-- =====================================================================
USE colegio;

ALTER TABLE estudiantes
  ADD COLUMN lugar_nacimiento VARCHAR(150) NULL AFTER fecha_nacimiento,
  ADD COLUMN foto             VARCHAR(255) NULL COMMENT 'Ruta relativa: files/<tenant>/estudiantes/<archivo>.jpg' AFTER telefono_celular;

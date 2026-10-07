-- =====================================================================
--  Estudiantes: código MINEDUC (opcional). El CUI pasa a ser obligatorio
--  (validado en la aplicación) y se deja de usar el apellido de casada.
-- =====================================================================
USE colegio;

ALTER TABLE estudiantes
  ADD COLUMN codigo_mineduc VARCHAR(20) NULL COMMENT 'Código personal del estudiante en MINEDUC (opcional)' AFTER dpi,
  ADD KEY idx_estudiantes_mineduc (codigo_mineduc);

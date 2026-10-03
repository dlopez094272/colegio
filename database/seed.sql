-- =====================================================================
--  SISTEMA DE GESTIÓN ESCOLAR — Datos iniciales
--  Ejecutar después de schema.sql
-- =====================================================================
USE colegio;

-- Grupo Super Administrador (GroupID fijo = -1) y grupos base
INSERT INTO seguridad_uggroups (GroupID, Label) VALUES (-1, '<Administrador>')
  ON DUPLICATE KEY UPDATE Label = '<Administrador>';
INSERT INTO seguridad_uggroups (GroupID, Label) VALUES (1, 'Secretaría')
  ON DUPLICATE KEY UPDATE Label = 'Secretaría';

-- Usuario administrador inicial
--   usuario: admin   contraseña: admin123   (se pide cambiarla al primer ingreso)
INSERT INTO usuarios (codigo, password, nombre_completo, email, activo, primer)
VALUES ('admin', '$2a$10$QK2Dj6n1fNrIprzoj9zLMuNgQTmX1gnQ5rmPWnsZ0hQBkCLQY2hSG', 'Administrador del Sistema', NULL, 1, 1)
  ON DUPLICATE KEY UPDATE codigo = codigo;

INSERT IGNORE INTO seguridad_ugmembers (UserName, GroupID) VALUES ('admin', -1);

-- Permisos del grupo Secretaría (ejemplo): gestión completa de padres y estudiantes
INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask) VALUES
  ('padres',          1, 'AESP'),
  ('estudiantes',     1, 'AESP'),
  ('estados_civiles', 1, 'S'),
  ('categorias_archivos', 1, 'S'),
  ('estructura_academica', 1, 'S'),
  ('docentes',        1, 'AESP'),
  ('formaciones_academicas', 1, 'S'),
  ('cuotas',          1, 'S'),
  ('inscripciones',   1, 'AESP'),
  ('pagos',           1, 'ASP')
ON DUPLICATE KEY UPDATE AccessMask = VALUES(AccessMask);

-- Catálogo de estados civiles
INSERT INTO estados_civiles (estado_civil) VALUES
  ('Soltero(a)'),
  ('Casado(a)'),
  ('Unido(a)'),
  ('Divorciado(a)'),
  ('Separado(a)'),
  ('Viudo(a)')
ON DUPLICATE KEY UPDATE estado_civil = VALUES(estado_civil);

-- Catálogo de categorías de archivos del estudiante
INSERT INTO categorias_archivos (categoria) VALUES
  ('Partida de nacimiento'),
  ('Certificado de estudios'),
  ('Constancia de vacunación'),
  ('Fotocopia de DPI del encargado'),
  ('Solvencia'),
  ('Otro')
ON DUPLICATE KEY UPDATE categoria = VALUES(categoria);

-- Niveles académicos
INSERT INTO niveles (nivel, usa_carreras, orden) VALUES
  ('Preprimaria',   0, 1),
  ('Primaria',      0, 2),
  ('Básico',        0, 3),
  ('Diversificado', 1, 4)
ON DUPLICATE KEY UPDATE nivel = VALUES(nivel);

-- Catálogo de formaciones académicas del personal docente
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

-- Cuotas base (los montos se configuran por ciclo y grado desde el sistema)
INSERT INTO cuotas (cuota, descripcion, periodicidad, obligatoria, orden) VALUES
  ('Inscripción',  'Pago anual de inscripción', 'Unica',   1, 1),
  ('Mensualidad',  'Colegiatura mensual',       'Mensual', 1, 2)
ON DUPLICATE KEY UPDATE cuota = VALUES(cuota);

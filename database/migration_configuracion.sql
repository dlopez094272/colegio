-- =====================================================================
--  Configuración del colegio (una sola fila por tenant):
--    datos generales y logotipo  → login, dashboard y todos los PDF
--    representante legal y resoluciones → contrato de adhesión (DIACO)
--    servidor SMTP y notificaciones     → inscripción y comprobante de pago
--  + Padres de familia: nacionalidad y correo electrónico (contrato y avisos)
-- =====================================================================
USE colegio;

ALTER TABLE padres
  ADD COLUMN nacionalidad VARCHAR(60)  NULL AFTER idestados_civiles,
  ADD COLUMN email        VARCHAR(145) NULL COMMENT 'Recibe la notificación de inscripción y los comprobantes de pago' AFTER telefono_celular;

-- Docentes comparten los campos del padre de familia
ALTER TABLE docentes
  ADD COLUMN nacionalidad VARCHAR(60) NULL AFTER idestados_civiles;

CREATE TABLE IF NOT EXISTS configuracion (
  idconfiguracion          TINYINT      NOT NULL DEFAULT 1,
  -- Datos generales
  nombre                   VARCHAR(150) NOT NULL DEFAULT 'Colegio',
  direccion                VARCHAR(300) NULL,
  municipio                VARCHAR(80)  NULL,
  departamento             VARCHAR(80)  NULL,
  telefonos                VARCHAR(100) NULL COMMENT 'Ej. 4055-1533 y 7760-3145',
  email                    VARCHAR(145) NULL,
  nit                      VARCHAR(20)  NULL,
  sitio_web                VARCHAR(150) NULL,
  logo                     VARCHAR(255) NULL COMMENT 'Ruta pública: files/<tenant>/colegio/<archivo>',
  -- Contrato de adhesión
  representante_nombre     VARCHAR(150) NULL,
  representante_titulo     VARCHAR(20)  NULL COMMENT 'Ej. Licda. (antepuesto al nombre en la firma)',
  representante_fecha_nacimiento DATE   NULL COMMENT 'La edad se calcula a la fecha del contrato',
  representante_estado_civil VARCHAR(30) NULL,
  representante_nacionalidad VARCHAR(60) NULL,
  representante_profesion  VARCHAR(150) NULL,
  representante_dpi        VARCHAR(20)  NULL,
  acreditacion             VARCHAR(400) NULL COMMENT 'Patente de comercio y resolución ministerial con que acredita la representación',
  resolucion_diaco         VARCHAR(300) NULL,
  autorizacion_servicio    VARCHAR(300) NULL COMMENT 'Acuerdo ministerial / resolución que autoriza el servicio',
  jornada                  VARCHAR(30)  NULL DEFAULT 'Matutina',
  firma_representante      VARCHAR(255) NULL COMMENT 'Imagen privada: storage/<tenant>/colegio/<archivo>',
  -- Correo saliente
  smtp_host                VARCHAR(150) NULL,
  smtp_puerto              SMALLINT     NULL DEFAULT 465,
  smtp_seguro              TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = SSL/TLS directo (465); 0 = STARTTLS (587)',
  smtp_usuario             VARCHAR(150) NULL,
  smtp_password            VARCHAR(500) NULL COMMENT 'Cifrada (AES-256-GCM); nunca se devuelve al cliente',
  smtp_remitente_nombre    VARCHAR(150) NULL,
  smtp_remitente_email     VARCHAR(150) NULL,
  notificar_inscripcion    TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Valor por defecto del aviso al inscribir',
  notificar_pago           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Valor por defecto del envío del comprobante',
  fecha_modificacion       DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idconfiguracion),
  CONSTRAINT ck_configuracion_unica CHECK (idconfiguracion = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO configuracion (idconfiguracion) VALUES (1);

INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask) VALUES
  ('configuracion', 1, 'ES')
ON DUPLICATE KEY UPDATE AccessMask = VALUES(AccessMask);

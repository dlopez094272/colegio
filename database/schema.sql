-- =====================================================================
--  SISTEMA DE GESTIÓN ESCOLAR — Esquema base
--  Base de datos: colegio (MySQL 8)
--  Arquitectura de seguridad/bitácora heredada de SMABI ERP.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS colegio
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE colegio;

-- =====================================================================
-- 1. Usuarios del sistema (login por código o correo)
-- =====================================================================
CREATE TABLE IF NOT EXISTS usuarios (
  idusuarios          INT          NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(45)  NOT NULL,
  password            VARCHAR(145) NOT NULL,
  nombre_completo     VARCHAR(150) NULL,
  email               VARCHAR(145) NULL,
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  primer              TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = debe cambiar contraseña al iniciar sesión',
  token               VARCHAR(245) NULL,
  fecha_restauracion  DATETIME     NULL,
  fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idusuarios),
  UNIQUE KEY uq_usuarios_codigo (codigo),
  KEY idx_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 2. Seguridad: grupos, miembros y permisos por tabla
--    GroupID = -1  → Super Administrador (acceso total)
--    AccessMask    → A=Añadir E=Editar D=Eliminar S=Listar
--                    P=Imprimir/Exportar I=Importar M=ModoAdmin
-- =====================================================================
CREATE TABLE IF NOT EXISTS seguridad_uggroups (
  GroupID INT          NOT NULL AUTO_INCREMENT,
  Label   VARCHAR(100) NOT NULL,
  PRIMARY KEY (GroupID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_ugmembers (
  id       INT          NOT NULL AUTO_INCREMENT,
  UserName VARCHAR(100) NOT NULL COMMENT 'usuarios.codigo',
  GroupID  INT          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member (UserName, GroupID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_ugrights (
  id         INT          NOT NULL AUTO_INCREMENT,
  TableName  VARCHAR(100) NOT NULL,
  GroupID    INT          NOT NULL,
  AccessMask VARCHAR(20)  NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_right (TableName, GroupID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 3. Bitácora del sistema (inserciones, modificaciones, activaciones...)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sistema_bitacora (
  idbitacora      BIGINT       NOT NULL AUTO_INCREMENT,
  tabla           VARCHAR(50)  NOT NULL COMMENT 'Nombre de la entidad',
  idregistro      INT          NOT NULL COMMENT 'ID del registro afectado',
  accion          VARCHAR(20)  NOT NULL COMMENT 'CREAR | MODIFICAR | ACTIVAR | INACTIVAR | ELIMINAR | ASIGNAR | DESASIGNAR',
  descripcion     VARCHAR(255) NULL,
  valores_antes   JSON         NULL,
  valores_despues JSON         NULL,
  idusuarios      INT          NULL,
  usuario_nombre  VARCHAR(100) NULL,
  ip              VARCHAR(45)  NULL,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idbitacora),
  INDEX idx_tabla_id (tabla, idregistro),
  INDEX idx_fecha    (fecha),
  INDEX idx_usuario  (idusuarios)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 4. Catálogo: Estados civiles
-- =====================================================================
CREATE TABLE IF NOT EXISTS estados_civiles (
  idestados_civiles INT         NOT NULL AUTO_INCREMENT,
  estado_civil      VARCHAR(60) NOT NULL,
  activo            TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (idestados_civiles),
  UNIQUE KEY uq_estado_civil (estado_civil)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 5. Padres de familia
-- =====================================================================
CREATE TABLE IF NOT EXISTS padres (
  idpadres            INT          NOT NULL AUTO_INCREMENT,
  primer_nombre       VARCHAR(60)  NOT NULL,
  segundo_nombre      VARCHAR(60)  NULL,
  primer_apellido     VARCHAR(60)  NOT NULL,
  segundo_apellido    VARCHAR(60)  NULL,
  apellido_casada     VARCHAR(60)  NULL,
  fecha_nacimiento    DATE         NULL,
  idestados_civiles   INT          NULL,
  nacionalidad        VARCHAR(60)  NULL,
  nit                 VARCHAR(20)  NULL,
  dpi                 VARCHAR(20)  NULL,
  pasaporte           VARCHAR(30)  NULL,
  direccion           VARCHAR(300) NULL,
  telefono_casa       VARCHAR(20)  NULL,
  telefono_celular    VARCHAR(20)  NULL,
  email               VARCHAR(145) NULL COMMENT 'Recibe la notificación de inscripción y los comprobantes de pago',
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  idusuarios          INT          NULL COMMENT 'Usuario que registró',
  fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_modificacion  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idpadres),
  KEY idx_padres_dpi (dpi),
  KEY idx_padres_nit (nit),
  KEY idx_padres_apellidos (primer_apellido, segundo_apellido),
  CONSTRAINT fk_padres_estado_civil FOREIGN KEY (idestados_civiles)
    REFERENCES estados_civiles (idestados_civiles)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 6. Estudiantes (mismos datos personales que el padre, sin NIT,
--    pasaporte ni estado civil)
-- =====================================================================
CREATE TABLE IF NOT EXISTS estudiantes (
  idestudiantes       INT          NOT NULL AUTO_INCREMENT,
  primer_nombre       VARCHAR(60)  NOT NULL,
  segundo_nombre      VARCHAR(60)  NULL,
  primer_apellido     VARCHAR(60)  NOT NULL,
  segundo_apellido    VARCHAR(60)  NULL,
  apellido_casada     VARCHAR(60)  NULL,
  fecha_nacimiento    DATE         NULL,
  lugar_nacimiento    VARCHAR(150) NULL,
  dpi                 VARCHAR(20)  NULL COMMENT 'CUI (obligatorio, validado en la aplicación)',
  codigo_mineduc      VARCHAR(20)  NULL COMMENT 'Código personal del estudiante en MINEDUC (opcional)',
  direccion           VARCHAR(300) NULL,
  telefono_casa       VARCHAR(20)  NULL,
  telefono_celular    VARCHAR(20)  NULL,
  foto                VARCHAR(255) NULL COMMENT 'Ruta relativa: files/<tenant>/estudiantes/<archivo>.jpg',
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  idusuarios          INT          NULL COMMENT 'Usuario que registró',
  fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_modificacion  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idestudiantes),
  KEY idx_estudiantes_dpi (dpi),
  KEY idx_estudiantes_mineduc (codigo_mineduc),
  KEY idx_estudiantes_apellidos (primer_apellido, segundo_apellido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 7. Relación Estudiantes ↔ Padres (N:M)
-- =====================================================================
CREATE TABLE IF NOT EXISTS estudiantes_padres (
  idestudiantes_padres INT         NOT NULL AUTO_INCREMENT,
  idestudiantes        INT         NOT NULL,
  idpadres             INT         NOT NULL,
  parentesco           VARCHAR(30) NULL COMMENT 'Padre | Madre | Tutor | Otro',
  fecha_creacion       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idestudiantes_padres),
  UNIQUE KEY uq_estudiante_padre (idestudiantes, idpadres),
  KEY idx_ep_padre (idpadres),
  CONSTRAINT fk_ep_estudiante FOREIGN KEY (idestudiantes)
    REFERENCES estudiantes (idestudiantes) ON DELETE CASCADE,
  CONSTRAINT fk_ep_padre FOREIGN KEY (idpadres)
    REFERENCES padres (idpadres) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 8. Catálogo: Categorías de archivos del estudiante
-- =====================================================================
CREATE TABLE IF NOT EXISTS categorias_archivos (
  idcategorias_archivos INT         NOT NULL AUTO_INCREMENT,
  categoria             VARCHAR(80) NOT NULL,
  activo                TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (idcategorias_archivos),
  UNIQUE KEY uq_categoria_archivo (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 9. Expediente de archivos del estudiante (los archivos viven en
--    backend/storage/<tenant>/, fuera de la carpeta pública)
-- =====================================================================
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

-- =====================================================================
-- 10. Estructura académica: Nivel → (Carrera) → Grado → Sección
--     Inactivar/activar un registro arrastra a todos sus descendientes.
-- =====================================================================
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

-- =====================================================================
-- 11. Personal docente (maestros y coordinadores) y su formación
--     académica (catálogo, N:M: un docente puede tener varias)
-- =====================================================================
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
  nacionalidad        VARCHAR(60)  NULL,
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

-- =====================================================================
-- 12. Cuotas: catálogo global configurado por ciclo escolar y asignado a
--     cada grado con su monto (sin fila en cuotas_grados = no aplica)
-- =====================================================================
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
  mes_vencido     TINYINT(1)    NOT NULL DEFAULT 0 COMMENT 'Mensual: 1 = cada cobro vence el dia_limite del mes siguiente',
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

-- =====================================================================
-- 13. Inscripciones, estado de cuenta (cargos) y pagos
--     (los cargos son copia de las cuotas del ciclo al inscribir)
-- =====================================================================
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


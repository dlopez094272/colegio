// ── Autenticación / Seguridad ────────────────────────────────────────────────

export interface Usuario {
  id: number;
  codigo: string;
  nombre: string;
  primer?: boolean;
  isSuperAdmin?: boolean;
}

export interface UsuarioCrud {
  idusuarios: number;
  codigo: string;
  nombre_completo: string;
  email: string | null;
  activo: number;
  primer: number;
  fecha_creacion?: string;
  grupos?: { GroupID: number; Label: string }[];
}

export interface GrupoSeguridad {
  GroupID: number;
  Label: string;
}

export interface PermisosTabla {
  tableName: string;
  mask: string;
}

// ── Respuestas genéricas ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PagedResponse<T> {
  success: boolean;
  data: T[];
  meta: PageMeta;
}

export interface PaginationOpts {
  page?: number;
  pageSize?: number;
  search?: string;
}

// ── Bitácora ─────────────────────────────────────────────────────────────────

export interface BitacoraRegistro {
  idbitacora: number;
  tabla: string;
  idregistro: number;
  accion: string;
  descripcion: string | null;
  valores_antes: any | null;
  valores_despues: any | null;
  idusuarios: number | null;
  usuario_nombre: string | null;
  ip: string | null;
  fecha: string;
}

// ── Catálogos ────────────────────────────────────────────────────────────────

export interface EstadoCivil {
  idestados_civiles: number;
  estado_civil: string;
  activo: number;
  total_padres?: number;
  total_docentes?: number;
}

export interface FormacionAcademica {
  idformaciones_academicas: number;
  formacion: string;
  activo: number;
  total_docentes?: number;
}

export interface CategoriaArchivo {
  idcategorias_archivos: number;
  categoria: string;
  activo: number;
  total_archivos?: number;
}

/** Archivo del expediente del estudiante (partida de nacimiento, certificados...). */
export interface EstudianteArchivo {
  idestudiantes_archivos: number;
  idestudiantes: number;
  idcategorias_archivos: number;
  categoria: string;
  nombre_original: string;
  mime: string | null;
  tamano: number;
  observaciones: string | null;
  fecha_creacion: string;
  usuario_registro: string | null;
}

// ── Padres de familia / Estudiantes ──────────────────────────────────────────

export type Parentesco = 'Padre' | 'Madre' | 'Tutor' | 'Otro';
export const PARENTESCOS: Parentesco[] = ['Padre', 'Madre', 'Tutor', 'Otro'];

/** Datos personales comunes a padres y estudiantes. */
export interface PersonaDatos {
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  apellido_casada: string;
  fecha_nacimiento: string;
  lugar_nacimiento?: string; // solo estudiantes
  dpi: string;               // CUI en estudiantes (obligatorio)
  codigo_mineduc?: string;   // solo estudiantes (opcional)
  direccion: string;
  telefono_casa: string;
  telefono_celular: string;
  // Solo padres de familia (y docentes)
  idestados_civiles?: number | null;
  nacionalidad?: string;
  nit?: string;
  pasaporte?: string;
  email?: string;
}

/** Registro de padre o estudiante tal como lo devuelve el listado/detalle. */
export interface PersonaRegistro {
  idpadres?: number;
  idestudiantes?: number;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  apellido_casada: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  lugar_nacimiento?: string | null;
  foto?: string | null;
  dpi: string | null;
  codigo_mineduc?: string | null; // solo estudiantes
  direccion: string | null;
  telefono_casa: string | null;
  telefono_celular: string | null;
  idestados_civiles?: number | null;
  estado_civil?: string | null;
  nacionalidad?: string | null;
  nit?: string | null;
  pasaporte?: string | null;
  email?: string | null;
  nombre_completo: string;
  activo: number;
  usuario_registro: string | null;
  fecha_creacion: string;
  fecha_modificacion: string | null;
  total_vinculos: number;
  vinculos_nombres: string | null;
  vinculos?: Vinculo[];
  total_archivos?: number; // solo estudiantes
}

/** Registro vinculado (estudiante de un padre o padre de un estudiante). */
export interface Vinculo {
  id: number;
  nombre_completo: string;
  primer_nombre?: string;
  primer_apellido?: string;
  dpi?: string | null;
  nit?: string | null;
  email?: string | null;
  edad?: number | null;
  telefono_celular?: string | null;
  foto?: string | null;
  activo?: number;
  parentesco: Parentesco | null;
}

/** Elemento de asignación que se envía al guardar. */
export interface VinculoPayload {
  id?: number;
  parentesco: Parentesco | null;
  nuevo?: Partial<PersonaDatos>;
}

// ── Personal docente ─────────────────────────────────────────────────────────

export type TipoPersonal = 'Maestro' | 'Coordinador';
export const TIPOS_PERSONAL: TipoPersonal[] = ['Maestro', 'Coordinador'];

/** Docente (maestro o coordinador): mismos datos del padre de familia + foto y formación. */
export interface Docente {
  iddocentes: number;
  tipo_personal: TipoPersonal;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  apellido_casada: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  dpi: string | null;
  nit: string | null;
  pasaporte: string | null;
  idestados_civiles: number | null;
  nacionalidad: string | null;
  estado_civil: string | null;
  direccion: string | null;
  telefono_casa: string | null;
  telefono_celular: string | null;
  email: string | null;
  fecha_ingreso: string | null;
  foto: string | null;
  nombre_completo: string;
  activo: number;
  usuario_registro: string | null;
  fecha_creacion: string;
  fecha_modificacion: string | null;
  /** Nombres de las formaciones separados por '||' (listado). */
  formaciones_nombres: string | null;
  /** Formaciones asignadas (solo en el detalle). */
  formaciones?: FormacionAcademica[];
}

export interface DashboardResumen {
  padres?: { total: number; activos: number; inactivos: number; nuevos_30d: number };
  estudiantes?: { total: number; activos: number; inactivos: number; nuevos_30d: number };
  estudiantes_sin_padres?: number;
  actividad?: { idbitacora: number; tabla: string; idregistro: number; accion: string; descripcion: string; usuario_nombre: string; fecha: string }[];
}

/** Estructura académica: Nivel → (Carrera) → Grado → Sección. */
export type TipoEstructura = 'nivel' | 'carrera' | 'grado' | 'seccion';

export interface Seccion {
  idsecciones: number;
  idgrados: number;
  seccion: string;
  activo: number;
}

export interface Grado {
  idgrados: number;
  idniveles: number;
  idcarreras: number | null;
  grado: string;
  orden: number;
  activo: number;
  secciones: Seccion[];
}

export interface Carrera {
  idcarreras: number;
  idniveles: number;
  carrera: string;
  orden: number;
  activo: number;
  grados: Grado[];
}

export interface Nivel {
  idniveles: number;
  nivel: string;
  usa_carreras: number;
  orden: number;
  activo: number;
  carreras: Carrera[];
  /** Grados directos (solo cuando el nivel no usa carreras). */
  grados: Grado[];
}

/** Cuotas: catálogo global → configuración por ciclo → monto por grado. */
export type Periodicidad = 'Unica' | 'Mensual';
export type MoraTipo = 'Ninguna' | 'Monto' | 'Porcentaje';

export interface Cuota {
  idcuotas: number;
  cuota: string;
  descripcion: string | null;
  periodicidad: Periodicidad;
  obligatoria: number;
  orden: number;
  activo: number;
  total_ciclos?: number;
}

export interface CuotaCiclo {
  idcuotas_ciclos: number;
  idcuotas: number;
  ciclo: number;
  fecha_inicio: string;
  fecha_fin: string;
  dia_limite: number;
  mes_vencido: number;
  mora_tipo: MoraTipo;
  mora_valor: number;
  cuota: string;
  periodicidad: Periodicidad;
  obligatoria: number;
  cuota_activa: number;
  total_grados: number;
}

export interface CuotaMonto {
  idcuotas_ciclos: number;
  idgrados: number;
  monto: number;
}

export interface GradoCuota {
  idgrados: number;
  grado: string;
  idniveles: number;
  nivel: string;
  idcarreras: number | null;
  carrera: string | null;
  activo: number;
}

export interface CicloCuotas {
  ciclo: number;
  cuotas: CuotaCiclo[];
  montos: CuotaMonto[];
  grados: GradoCuota[];
}

// ── Inscripciones, estado de cuenta y pagos ──────────────────────────────────

export type EstadoInscripcion = 'Activa' | 'Anulada';
export type EstadoCargo = 'Pendiente' | 'Pagado' | 'Anulado';
export type FormaPago = 'Efectivo' | 'Depósito' | 'Transferencia' | 'Tarjeta' | 'Cheque';
export const FORMAS_PAGO: FormaPago[] = ['Efectivo', 'Depósito', 'Transferencia', 'Tarjeta', 'Cheque'];

export interface Inscripcion {
  idinscripciones: number;
  codigo: string;
  ciclo: number;
  idestudiantes: number;
  idgrados: number;
  idsecciones: number | null;
  idpadres: number | null;
  fecha_inscripcion: string;
  estado: EstadoInscripcion;
  observaciones: string | null;
  motivo_anulacion: string | null;
  fecha_anulacion: string | null;
  contrato_firmado: number;
  contrato_nombre: string | null;
  contrato_mime: string | null;
  contrato_fecha: string | null;
  fecha_creacion: string;
  fecha_modificacion: string | null;
  usuario_registro: string | null;
  estudiante: string;
  estudiante_dpi: string | null;
  estudiante_foto: string | null;
  grado: string;
  idniveles: number;
  nivel: string;
  idcarreras: number | null;
  carrera: string | null;
  seccion: string | null;
  encargado: string | null;
  encargado_dpi: string | null;
  encargado_telefono: string | null;
  encargado_email: string | null;
  cargos_pendientes: number;
  cargos_vencidos: number;
  saldo_pendiente: number;
}

/** Estructura activa para los selectores en cascada del formulario. */
export interface OpcionesInscripcion {
  niveles: { idniveles: number; nivel: string; usa_carreras: number }[];
  carreras: { idcarreras: number; idniveles: number; carrera: string }[];
  grados: { idgrados: number; idniveles: number; idcarreras: number | null; grado: string }[];
  secciones: { idsecciones: number; idgrados: number; seccion: string }[];
}

/** Cuota del ciclo que aplica a un grado (vista previa al inscribir). */
export interface CuotaGrado {
  idcuotas_ciclos: number;
  idcuotas: number;
  cuota: string;
  periodicidad: Periodicidad;
  obligatoria: number;
  fecha_inicio: string;
  fecha_fin: string;
  dia_limite: number;
  mes_vencido: number;
  mora_tipo: MoraTipo;
  mora_valor: number;
  monto: number;
  cobros: number;
}

export interface ContextoEstudiante {
  estudiante: { idestudiantes: number; nombre_completo: string; dpi: string | null; foto: string | null; activo: number; edad: number | null };
  padres: Vinculo[];
  inscripciones: { idinscripciones: number; codigo: string; ciclo: number; estado: EstadoInscripcion; grado: string; nivel: string; carrera: string | null; seccion: string | null }[];
}

export interface Cargo {
  idinscripciones_cargos: number;
  idinscripciones: number;
  idcuotas_ciclos: number;
  idcuotas: number;
  numero_cobro: number;
  concepto: string;
  cuota: string;
  obligatoria: number;
  fecha_vencimiento: string;
  monto: number;
  mora_tipo: MoraTipo;
  mora_valor: number;
  estado: EstadoCargo;
  motivo_anulacion: string | null;
  // Pago que lo liquidó
  idpagos: number | null;
  recibo: number | null;
  fecha_pago: string | null;
  mora_pagada: number | null;
  mora_exonerada: number | null;
  total_pagado: number | null;
  // Pendientes: mora a la fecha
  mora_actual: number;
  vencido: number;
}

export interface EstadoCuenta {
  inscripcion: Inscripcion;
  fecha: string;
  cargos: Cargo[];
  totales: { pagado: number; pendiente: number; mora: number; vencido: number; anulado: number; saldo: number };
  disponibles: CuotaGrado[];
}

export interface Pago {
  idpagos: number;
  numero: number;
  fecha_pago: string;
  idpadres: number | null;
  pagador_nombre: string;
  pagador_nit: string;
  forma_pago: FormaPago;
  referencia: string | null;
  observaciones: string | null;
  subtotal: number;
  mora: number;
  total: number;
  estado: 'Activo' | 'Anulado';
  motivo_anulacion: string | null;
  fecha_anulacion: string | null;
  fecha_creacion: string;
  usuario_registro: string | null;
  estudiantes: string | null;
  lineas: number;
  detalle?: PagoDetalle[];
}

export interface PagoDetalle {
  idpagos_detalle: number;
  idinscripciones_cargos: number;
  concepto: string;
  fecha_vencimiento: string;
  monto_pagado: number;
  mora_pagada: number;
  mora_exonerada: number;
  total_linea: number;
  codigo: string;
  estudiante: string;
  grado: string;
  seccion: string | null;
}

/** Resultado del buscador de cobro: padre (todos sus hijos) o estudiante. */
export interface PagadorBusqueda {
  tipo: 'padre' | 'estudiante';
  id: number;
  nombre: string;
  dpi: string | null;
  nit?: string | null;
  detalle: string | null;
  pendientes: number;
}

/** Cuota pendiente a cobrar, con la mora calculada a la fecha de pago. */
export interface CargoPendiente {
  idinscripciones_cargos: number;
  idinscripciones: number;
  concepto: string;
  fecha_vencimiento: string;
  monto: number;
  mora: number;
  vencido: number;
  codigo: string;
  ciclo: number;
  idestudiantes: number;
  estudiante: string;
  grado: string;
  nivel: string;
  carrera: string | null;
  seccion: string | null;
}

export interface PendientesPago {
  fecha: string;
  pagadores: { idpadres: number; nombre: string; nit: string | null; email: string | null; parentesco: string | null }[];
  cargos: CargoPendiente[];
}

// ── Configuración del colegio ────────────────────────────────────────────────

/** Datos del colegio para login, dashboard y opciones de correo. */
export interface ColegioResumen {
  nombre: string;
  logo: string | null;
  direccion?: string | null;
  municipio?: string | null;
  departamento?: string | null;
  telefonos?: string | null;
  email?: string | null;
  sitio_web?: string | null;
  correo_habilitado?: boolean;
  notificar_inscripcion?: boolean;
  notificar_pago?: boolean;
}

export interface Configuracion {
  nombre: string;
  direccion: string | null;
  municipio: string | null;
  departamento: string | null;
  telefonos: string | null;
  email: string | null;
  nit: string | null;
  sitio_web: string | null;
  logo: string | null;
  representante_nombre: string | null;
  representante_titulo: string | null;
  representante_fecha_nacimiento: string | null;
  representante_estado_civil: string | null;
  representante_nacionalidad: string | null;
  representante_profesion: string | null;
  representante_dpi: string | null;
  acreditacion: string | null;
  resolucion_diaco: string | null;
  autorizacion_servicio: string | null;
  jornada: string | null;
  smtp_host: string | null;
  smtp_puerto: number | null;
  smtp_seguro: number;
  smtp_usuario: string | null;
  smtp_remitente_nombre: string | null;
  smtp_remitente_email: string | null;
  notificar_inscripcion: number;
  notificar_pago: number;
  smtp_password_guardada: boolean;
  tiene_firma: boolean;
  fecha_modificacion: string | null;
}

/** Resultado del envío automático de correo al crear una inscripción o un pago. */
export interface ResultadoCorreo {
  enviado: boolean;
  destinatarios?: string[];
  error?: string;
}

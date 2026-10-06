const path = require('path');
const { pool } = require('../config/database');
const { getCurrentTenant } = require('../config/tenantContext');

/**
 * Configuración del colegio: una sola fila (idconfiguracion = 1) por tenant.
 * Datos generales y logotipo (login, dashboard, PDF), datos del contrato de
 * adhesión y servidor de correo saliente.
 */

const CAMPOS_GENERALES = ['nombre', 'direccion', 'municipio', 'departamento', 'telefonos', 'email', 'nit', 'sitio_web'];
const CAMPOS_CONTRATO = [
  'representante_nombre', 'representante_titulo', 'representante_fecha_nacimiento', 'representante_estado_civil',
  'representante_nacionalidad', 'representante_profesion', 'representante_dpi',
  'acreditacion', 'resolucion_diaco', 'autorizacion_servicio', 'jornada',
];
const CAMPOS_CORREO = [
  'smtp_host', 'smtp_puerto', 'smtp_seguro', 'smtp_usuario', 'smtp_remitente_nombre', 'smtp_remitente_email',
  'notificar_inscripcion', 'notificar_pago',
];
const CAMPOS = [...CAMPOS_GENERALES, ...CAMPOS_CONTRATO, ...CAMPOS_CORREO];

const PUBLIC_ROOT  = path.join(__dirname, '../../public/files');
const STORAGE_ROOT = path.join(__dirname, '../../storage');

const ConfiguracionModel = {
  CAMPOS_GENERALES, CAMPOS_CONTRATO, CAMPOS_CORREO, CAMPOS,

  /** Fila completa (incluye smtp_password cifrada: no enviarla al cliente). */
  async get() {
    const [rows] = await pool.query(
      `SELECT c.*, DATE_FORMAT(c.representante_fecha_nacimiento, '%Y-%m-%d') AS representante_fecha_nacimiento
         FROM configuracion c WHERE c.idconfiguracion = 1`
    );
    if (rows[0]) return rows[0];
    await pool.query('INSERT IGNORE INTO configuracion (idconfiguracion) VALUES (1)');
    return this.get();
  },

  async update(data) {
    await pool.query('UPDATE configuracion SET ? WHERE idconfiguracion = 1', [data]);
  },

  async setArchivo(campo, valor) {
    if (!['logo', 'firma_representante'].includes(campo)) throw new Error(`Campo de archivo no válido: ${campo}`);
    await pool.query(`UPDATE configuracion SET ${campo} = ? WHERE idconfiguracion = 1`, [valor]);
  },

  /** Ruta en disco del logo (público: files/<tenant>/colegio/...). */
  rutaLogo(logo) {
    if (!logo || !logo.startsWith('files/colegio/')) return null;
    const base = path.join(PUBLIC_ROOT, getCurrentTenant()?.uploadsDir || '');
    const ruta = path.join(base, logo.substring('files/'.length));
    return ruta.startsWith(base + path.sep) ? ruta : null;
  },

  /** Ruta en disco de la firma del representante (privada: storage/<tenant>/colegio/...). */
  rutaFirma(firma) {
    if (!firma || !firma.startsWith('colegio/')) return null;
    const base = path.join(STORAGE_ROOT, getCurrentTenant()?.uploadsDir || '');
    const ruta = path.join(base, firma);
    return ruta.startsWith(base + path.sep) ? ruta : null;
  },

  /**
   * Datos del colegio para los PDF y los correos. Lo que no se haya llenado
   * en Configuración se toma de tenants.json → colegio (compatibilidad).
   */
  async datosColegio() {
    const { smtp_password, ...c } = await this.get();
    const t = getCurrentTenant()?.colegio || {};
    return {
      ...c,
      nombre:    (c.nombre && c.nombre !== 'Colegio' ? c.nombre : null) || t.nombre || 'Colegio',
      direccion: c.direccion || t.direccion || '',
      telefonos: c.telefonos || t.telefono || '',
      nit:       c.nit || t.nit || '',
      logoRuta:  this.rutaLogo(c.logo),
      firmaRuta: this.rutaFirma(c.firma_representante),
    };
  },
};

module.exports = ConfiguracionModel;

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');
const ConfiguracionModel = require('../models/configuracionModel');
const { registrarBitacora } = require('../utils/bitacora');
const { cifrar } = require('../utils/secreto');
const { correoDisponible } = require('../config/mailer');
const { correoPrueba, leerCorreos } = require('../utils/notificaciones');

// Logotipo: público (se muestra en el login, antes de iniciar sesión) en
// files/<tenant>/colegio/. Firma del representante: privada en
// storage/<tenant>/colegio/ (solo se imprime en el contrato).
// Solo PNG o JPG: son los formatos que acepta el generador de PDF.
const PUBLIC_ROOT  = path.join(__dirname, '../../public/files');
const STORAGE_ROOT = path.join(__dirname, '../../storage');
const EXTENSIONES  = { 'image/png': '.png', 'image/jpeg': '.jpg' };
const MAX_MB = 2;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!EXTENSIONES[file.mimetype]) return cb(Object.assign(new Error('Formato no permitido. Use PNG o JPG.'), { status: 400 }));
    cb(null, true);
  },
});

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX = {
  nombre: 150, direccion: 300, municipio: 80, departamento: 80, telefonos: 100, email: 145, nit: 20, sitio_web: 150,
  representante_nombre: 150, representante_titulo: 20, representante_estado_civil: 30, representante_nacionalidad: 60,
  representante_profesion: 150, representante_dpi: 20, acreditacion: 400, resolucion_diaco: 300, autorizacion_servicio: 300,
  jornada: 30, smtp_host: 150, smtp_usuario: 150, smtp_remitente_nombre: 150, smtp_remitente_email: 150,
};
const BOOLEANOS = ['smtp_seguro', 'notificar_inscripcion', 'notificar_pago'];
const ETIQUETAS = {
  nombre: 'El nombre del colegio', email: 'El correo del colegio', representante_dpi: 'El DPI del representante',
  representante_fecha_nacimiento: 'La fecha de nacimiento del representante', smtp_puerto: 'El puerto SMTP',
  smtp_remitente_email: 'El correo del remitente',
};

const texto = v => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s || null; };

/** Lee y valida los campos de configuración del body. Devuelve { data } o { error }. */
function leerConfiguracion(body) {
  const data = {};
  for (const c of ConfiguracionModel.CAMPOS) {
    if (!(c in body)) continue;
    if (BOOLEANOS.includes(c)) data[c] = body[c] ? 1 : 0;
    else if (c === 'smtp_puerto') data[c] = body[c] === '' || body[c] === null ? null : Number(body[c]);
    else data[c] = texto(body[c]);
  }
  if ('nombre' in data && !data.nombre) return { error: 'El nombre del colegio es requerido' };
  for (const [c, max] of Object.entries(MAX)) {
    if (data[c] && data[c].length > max) return { error: `${ETIQUETAS[c] || `El campo ${c.replace(/_/g, ' ')}`} excede ${max} caracteres` };
  }
  for (const c of ['email', 'smtp_remitente_email']) {
    if (data[c]) data[c] = data[c].toLowerCase();
    if (data[c] && !RE_EMAIL.test(data[c])) return { error: `${ETIQUETAS[c]} no es válido` };
  }
  if (data.representante_dpi) {
    data.representante_dpi = data.representante_dpi.replace(/[\s-]/g, '');
    if (!/^\d{13}$/.test(data.representante_dpi)) return { error: `${ETIQUETAS.representante_dpi} debe tener 13 dígitos` };
  }
  if (data.representante_fecha_nacimiento) {
    const f = data.representante_fecha_nacimiento.substring(0, 10);
    if (!RE_FECHA.test(f) || isNaN(Date.parse(f))) return { error: `${ETIQUETAS.representante_fecha_nacimiento} no es válida` };
    data.representante_fecha_nacimiento = f;
  }
  if (data.smtp_puerto !== undefined && data.smtp_puerto !== null && !(Number.isInteger(data.smtp_puerto) && data.smtp_puerto > 0 && data.smtp_puerto < 65536))
    return { error: `${ETIQUETAS.smtp_puerto} no es válido` };
  if (data.nit) data.nit = data.nit.toUpperCase().replace(/\s/g, '');
  return { data };
}

/** Configuración para el cliente: sin la contraseña SMTP ni rutas privadas. */
function paraCliente(c) {
  const { smtp_password, firma_representante, ...resto } = c;
  return { ...resto, smtp_password_guardada: !!smtp_password, tiene_firma: !!firma_representante };
}

function carpeta(req, raiz) {
  return path.join(raiz, req.tenant.uploadsDir || '', 'colegio');
}

const ctrl = {
  // GET /api/configuracion/publica   (sin sesión: pantalla de login)
  async publica(req, res, next) {
    try {
      const c = await ConfiguracionModel.datosColegio();
      res.json({ success: true, data: { nombre: c.nombre, logo: c.logo } });
    } catch (err) { next(err); }
  },

  // GET /api/configuracion/resumen   (cualquier usuario con sesión: dashboard y avisos por correo)
  async resumen(req, res, next) {
    try {
      const c = await ConfiguracionModel.datosColegio();
      res.json({
        success: true,
        data: {
          nombre: c.nombre, logo: c.logo, direccion: c.direccion, municipio: c.municipio, departamento: c.departamento,
          telefonos: c.telefonos, email: c.email, sitio_web: c.sitio_web,
          correo_habilitado: await correoDisponible(),
          notificar_inscripcion: !!c.notificar_inscripcion, notificar_pago: !!c.notificar_pago,
        },
      });
    } catch (err) { next(err); }
  },

  // GET /api/configuracion
  async get(req, res, next) {
    try {
      res.json({ success: true, data: paraCliente(await ConfiguracionModel.get()) });
    } catch (err) { next(err); }
  },

  // PUT /api/configuracion   { ...campos, smtp_password?: nueva, smtp_password_borrar?: true }
  async update(req, res, next) {
    try {
      const { data, error } = leerConfiguracion(req.body);
      if (error) return res.status(400).json({ message: error });
      const pass = typeof req.body.smtp_password === 'string' ? req.body.smtp_password : '';
      if (pass.length > 200) return res.status(400).json({ message: 'La contraseña SMTP es demasiado larga' });
      if (pass) data.smtp_password = cifrar(pass);
      else if (req.body.smtp_password_borrar) data.smtp_password = null;

      const antes = await ConfiguracionModel.get();
      await ConfiguracionModel.update(data);

      // Bitácora: solo lo que cambió (la contraseña se registra sin su valor)
      const valoresAntes = {}, valoresDespues = {};
      for (const [k, v] of Object.entries(data)) {
        if (k === 'smtp_password') continue;
        const a = antes[k] instanceof Date ? antes[k].toISOString().substring(0, 10) : antes[k];
        if (String(a ?? '') !== String(v ?? '')) { valoresAntes[k] = a ?? null; valoresDespues[k] = v; }
      }
      if ('smtp_password' in data) { valoresAntes.smtp_password = antes.smtp_password ? '(guardada)' : null; valoresDespues.smtp_password = data.smtp_password ? '(cambiada)' : null; }
      if (Object.keys(valoresDespues).length) {
        await registrarBitacora({
          tabla: 'configuracion', idregistro: 1, accion: 'MODIFICAR',
          descripcion: `Configuración del colegio modificada: ${Object.keys(valoresDespues).join(', ')}`,
          valoresAntes, valoresDespues, req,
        });
      }
      res.json({ success: true, data: paraCliente(await ConfiguracionModel.get()) });
    } catch (err) { next(err); }
  },

  // POST /api/configuracion/probar-correo   { correos, ...campos SMTP sin guardar, smtp_password? }
  // Prueba lo que está en el formulario; si no se escribe contraseña usa la guardada.
  async probarCorreo(req, res, next) {
    try {
      const para = leerCorreos(req.body.correos);
      if (!para.length) return res.status(400).json({ message: 'Indique el correo al que se enviará la prueba' });
      const { data, error } = leerConfiguracion(req.body);
      if (error) return res.status(400).json({ message: error });
      const guardada = await ConfiguracionModel.get();
      const config = { ...guardada, ...data };
      if (req.body.smtp_password) config.smtp_password = cifrar(String(req.body.smtp_password));
      if (!config.smtp_host || !config.smtp_usuario || !config.smtp_password)
        return res.status(400).json({ message: 'Complete el servidor, usuario y contraseña SMTP' });
      try {
        await correoPrueba(para, config);
      } catch (err) {
        return res.status(502).json({ message: `No se pudo enviar: ${err.message}` });
      }
      res.json({ success: true, destinatarios: para });
    } catch (err) { next(err); }
  },

  // ─── Logotipo y firma ───
  recibirImagen(req, res, next) {
    upload.single('imagen')(req, res, (err) => {
      if (!err) return next();
      const message = err.code === 'LIMIT_FILE_SIZE' ? `La imagen excede ${MAX_MB} MB` : err.message;
      res.status(400).json({ success: false, message });
    });
  },

  // POST /api/configuracion/logo   (multipart: imagen)
  async subirLogo(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });
      const dir = carpeta(req, PUBLIC_ROOT);
      await fs.promises.mkdir(dir, { recursive: true });
      const nombre = `logo_${crypto.randomBytes(8).toString('hex')}${EXTENSIONES[req.file.mimetype]}`;
      await fs.promises.writeFile(path.join(dir, nombre), req.file.buffer);
      const antes = await ConfiguracionModel.get();
      const logo = `files/colegio/${nombre}`;
      await ConfiguracionModel.setArchivo('logo', logo);
      const anterior = ConfiguracionModel.rutaLogo(antes.logo);
      if (anterior) fs.promises.unlink(anterior).catch(() => {});
      await registrarBitacora({
        tabla: 'configuracion', idregistro: 1, accion: 'MODIFICAR',
        descripcion: `Logotipo del colegio ${antes.logo ? 'reemplazado' : 'agregado'}`,
        valoresAntes: { logo: antes.logo }, valoresDespues: { logo }, req,
      });
      res.json({ success: true, logo });
    } catch (err) { next(err); }
  },

  // DELETE /api/configuracion/logo
  async quitarLogo(req, res, next) {
    try {
      const antes = await ConfiguracionModel.get();
      if (!antes.logo) return res.json({ success: true });
      await ConfiguracionModel.setArchivo('logo', null);
      const ruta = ConfiguracionModel.rutaLogo(antes.logo);
      if (ruta) fs.promises.unlink(ruta).catch(() => {});
      await registrarBitacora({
        tabla: 'configuracion', idregistro: 1, accion: 'MODIFICAR', descripcion: 'Logotipo del colegio eliminado',
        valoresAntes: { logo: antes.logo }, valoresDespues: { logo: null }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // POST /api/configuracion/firma   (multipart: imagen)
  async subirFirma(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });
      const dir = carpeta(req, STORAGE_ROOT);
      await fs.promises.mkdir(dir, { recursive: true });
      const nombre = `firma_${crypto.randomBytes(12).toString('hex')}${EXTENSIONES[req.file.mimetype]}`;
      await fs.promises.writeFile(path.join(dir, nombre), req.file.buffer);
      const antes = await ConfiguracionModel.get();
      await ConfiguracionModel.setArchivo('firma_representante', `colegio/${nombre}`);
      const anterior = ConfiguracionModel.rutaFirma(antes.firma_representante);
      if (anterior) fs.promises.unlink(anterior).catch(() => {});
      await registrarBitacora({
        tabla: 'configuracion', idregistro: 1, accion: 'MODIFICAR',
        descripcion: `Firma del representante legal ${antes.firma_representante ? 'reemplazada' : 'agregada'}`, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // GET /api/configuracion/firma
  async verFirma(req, res, next) {
    try {
      const c = await ConfiguracionModel.get();
      const ruta = ConfiguracionModel.rutaFirma(c.firma_representante);
      if (!ruta || !fs.existsSync(ruta)) return res.status(404).json({ message: 'No hay firma cargada' });
      res.setHeader('Content-Type', ruta.endsWith('.png') ? 'image/png' : 'image/jpeg');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      fs.createReadStream(ruta).on('error', next).pipe(res);
    } catch (err) { next(err); }
  },

  // DELETE /api/configuracion/firma
  async quitarFirma(req, res, next) {
    try {
      const c = await ConfiguracionModel.get();
      if (!c.firma_representante) return res.json({ success: true });
      await ConfiguracionModel.setArchivo('firma_representante', null);
      const ruta = ConfiguracionModel.rutaFirma(c.firma_representante);
      if (ruta) fs.promises.unlink(ruta).catch(() => {});
      await registrarBitacora({ tabla: 'configuracion', idregistro: 1, accion: 'MODIFICAR', descripcion: 'Firma del representante legal eliminada', req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = ctrl;

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');
const EstudianteModel        = require('../models/estudianteModel');
const EstudianteArchivoModel = require('../models/estudianteArchivoModel');
const CategoriaArchivoModel  = require('../models/categoriaArchivoModel');
const { registrarBitacora }  = require('../utils/bitacora');

// A diferencia de las fotos (/files, público), el expediente del estudiante
// contiene documentos sensibles: se guarda FUERA de public/ y solo se entrega
// por GET /api/estudiantes/:id/archivos/:idArchivo, que exige token y permiso.
const STORAGE_ROOT = path.join(__dirname, '../../storage');
const MAX_MB = 20;

// Solo estos tipos se muestran "inline" en el navegador; cualquier otro se
// fuerza como descarga para que un HTML/SVG subido no se ejecute en el origen de la API.
const INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  defParamCharset: 'utf8', // nombres con tildes/ñ llegan bien
});

function carpetaTenant(req) {
  return path.join(STORAGE_ROOT, req.tenant.uploadsDir || '');
}

// Ruta guardada en BD (relativa a la carpeta del tenant) → archivo en disco
function rutaEnDisco(req, archivo) {
  if (!archivo || !archivo.startsWith('estudiantes/')) return null;
  const base = carpetaTenant(req);
  const ruta = path.join(base, archivo);
  return ruta.startsWith(base + path.sep) ? ruta : null;
}

function extension(nombre) {
  const ext = path.extname(nombre || '').toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

function resumen(a) {
  return { idestudiantes_archivos: a.idestudiantes_archivos, categoria: a.categoria, nombre_original: a.nombre_original, tamano: a.tamano, observaciones: a.observaciones };
}

const estudianteArchivoController = {
  // Middleware multer: convierte el error de tamaño en 400 legible
  recibir(req, res, next) {
    upload.single('archivo')(req, res, (err) => {
      if (!err) return next();
      const message = err.code === 'LIMIT_FILE_SIZE' ? `El archivo excede ${MAX_MB} MB` : err.message;
      res.status(400).json({ success: false, message });
    });
  },

  // GET /api/estudiantes/:id/archivos
  async listar(req, res, next) {
    try {
      const data = await EstudianteArchivoModel.getByEstudiante(Number(req.params.id));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  // POST /api/estudiantes/:id/archivos  (multipart: archivo, idcategorias_archivos, observaciones)
  async subir(req, res, next) {
    try {
      const id = Number(req.params.id);
      const estudiante = await EstudianteModel.findById(id);
      if (!estudiante) return res.status(404).json({ message: 'Estudiante no encontrado' });
      if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

      const idcategoria = Number(req.body.idcategorias_archivos);
      const categoria = Number.isInteger(idcategoria) && idcategoria > 0 ? await CategoriaArchivoModel.findById(idcategoria) : null;
      if (!categoria) return res.status(400).json({ message: 'Seleccione una categoría válida' });

      const nombre_original = (req.file.originalname || 'archivo').substring(0, 255);
      const dirRel = `estudiantes/${id}`;
      const dir = path.join(carpetaTenant(req), dirRel);
      await fs.promises.mkdir(dir, { recursive: true });
      const nombre = `${crypto.randomBytes(16).toString('hex')}${extension(nombre_original)}`;
      await fs.promises.writeFile(path.join(dir, nombre), req.file.buffer);

      const datos = {
        idestudiantes: id,
        idcategorias_archivos: categoria.idcategorias_archivos,
        nombre_original,
        archivo: `${dirRel}/${nombre}`,
        mime: (req.file.mimetype || 'application/octet-stream').substring(0, 150),
        tamano: req.file.size,
        observaciones: req.body.observaciones?.trim().substring(0, 255) || null,
      };
      let idArchivo;
      try {
        idArchivo = await EstudianteArchivoModel.create(datos, req.user?.id);
      } catch (err) {
        fs.promises.unlink(path.join(dir, nombre)).catch(() => {});
        throw err;
      }

      const nuevo = await EstudianteArchivoModel.findById(id, idArchivo);
      await registrarBitacora({
        tabla: 'estudiantes', idregistro: id, accion: 'MODIFICAR',
        descripcion: `Archivo agregado (${categoria.categoria}): ${nombre_original} — ${estudiante.nombre_completo}`,
        valoresDespues: { archivo: resumen(nuevo) }, req,
      });
      res.status(201).json({ success: true, data: nuevo });
    } catch (err) { next(err); }
  },

  // GET /api/estudiantes/:id/archivos/:idArchivo[?descargar=1]
  async descargar(req, res, next) {
    try {
      const a = await EstudianteArchivoModel.findById(Number(req.params.id), Number(req.params.idArchivo));
      if (!a) return res.status(404).json({ message: 'Archivo no encontrado' });
      const ruta = rutaEnDisco(req, a.archivo);
      if (!ruta || !fs.existsSync(ruta)) return res.status(404).json({ message: 'El archivo ya no existe en el servidor' });

      const inline = INLINE.has(a.mime) && req.query.descargar !== '1';
      res.attachment(a.nombre_original); // fija Content-Disposition (y un Content-Type que se reemplaza abajo)
      if (inline) res.setHeader('Content-Disposition', res.getHeader('Content-Disposition').replace(/^attachment/, 'inline'));
      res.setHeader('Content-Type', inline ? a.mime : 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      fs.createReadStream(ruta).on('error', next).pipe(res);
    } catch (err) { next(err); }
  },

  // DELETE /api/estudiantes/:id/archivos/:idArchivo
  async eliminar(req, res, next) {
    try {
      const id = Number(req.params.id);
      const a = await EstudianteArchivoModel.findById(id, Number(req.params.idArchivo));
      if (!a) return res.status(404).json({ message: 'Archivo no encontrado' });
      const estudiante = await EstudianteModel.findById(id);

      await EstudianteArchivoModel.delete(a.idestudiantes_archivos);
      const ruta = rutaEnDisco(req, a.archivo);
      if (ruta) fs.promises.unlink(ruta).catch(() => {});

      await registrarBitacora({
        tabla: 'estudiantes', idregistro: id, accion: 'MODIFICAR',
        descripcion: `Archivo eliminado (${a.categoria}): ${a.nombre_original} — ${estudiante?.nombre_completo ?? ''}`,
        valoresAntes: { archivo: resumen(a) }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = estudianteArchivoController;

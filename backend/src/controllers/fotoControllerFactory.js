const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { registrarBitacora } = require('../utils/bitacora');

const UPLOADS_ROOT = path.join(__dirname, '../../public/files');
const EXTENSIONES  = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// La foto se recibe en memoria (el frontend ya la recorta y comprime) y se
// escribe con un nombre aleatorio: los archivos se sirven por /files sin
// token, así que el nombre no debe poder adivinarse a partir del id.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!EXTENSIONES[file.mimetype]) return cb(Object.assign(new Error('Formato no permitido. Use JPG, PNG o WEBP.'), { status: 400 }));
    cb(null, true);
  },
});

function carpetaTenant(req) {
  return path.join(UPLOADS_ROOT, req.tenant.uploadsDir || '');
}

/**
 * Fotografía de una persona (estudiantes, docentes): misma lógica de subida,
 * reemplazo y eliminación para cada módulo, cada uno en su propia carpeta.
 *
 * @param {object} cfg
 * @param {string} cfg.tabla    - tabla para la bitácora ('estudiantes' | 'docentes')
 * @param {string} cfg.carpeta  - subcarpeta dentro de files/<tenant>/
 * @param {string} cfg.etiqueta - texto legible para mensajes ('Estudiante')
 * @param {object} cfg.Modelo   - modelo con findById(id) y setFoto(id, foto)
 */
function crearControladorFoto({ tabla, carpeta, etiqueta, Modelo }) {
  const prefijo = `files/${carpeta}/`;

  // Ruta guardada en BD (relativa a la carpeta del tenant) → archivo en disco
  function rutaEnDisco(req, foto) {
    if (!foto || !foto.startsWith(prefijo)) return null;
    const archivo = path.join(carpetaTenant(req), foto.substring('files/'.length));
    return archivo.startsWith(carpetaTenant(req)) ? archivo : null;
  }

  function borrarArchivo(req, foto) {
    const archivo = rutaEnDisco(req, foto);
    if (archivo) fs.promises.unlink(archivo).catch(() => {});
  }

  return {
    // Middleware multer: convierte el error de tamaño/formato en 400 legible
    recibir(req, res, next) {
      upload.single('foto')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen excede 5 MB' : err.message;
        res.status(400).json({ success: false, message });
      });
    },

    // POST /api/<modulo>/:id/foto  (multipart, campo "foto")
    async subir(req, res, next) {
      try {
        const id = Number(req.params.id);
        const registro = await Modelo.findById(id);
        if (!registro) return res.status(404).json({ message: `${etiqueta} no encontrado` });
        if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

        const dir = path.join(carpetaTenant(req), carpeta);
        await fs.promises.mkdir(dir, { recursive: true });
        const nombre = `${id}_${crypto.randomBytes(12).toString('hex')}${EXTENSIONES[req.file.mimetype]}`;
        await fs.promises.writeFile(path.join(dir, nombre), req.file.buffer);

        const foto = `${prefijo}${nombre}`;
        await Modelo.setFoto(id, foto);
        borrarArchivo(req, registro.foto);

        await registrarBitacora({
          tabla, idregistro: id, accion: 'MODIFICAR',
          descripcion: `Fotografía ${registro.foto ? 'actualizada' : 'agregada'}: ${registro.nombre_completo}`,
          valoresAntes: { foto: registro.foto }, valoresDespues: { foto }, req,
        });
        res.json({ success: true, foto });
      } catch (err) { next(err); }
    },

    // DELETE /api/<modulo>/:id/foto
    async quitar(req, res, next) {
      try {
        const id = Number(req.params.id);
        const registro = await Modelo.findById(id);
        if (!registro) return res.status(404).json({ message: `${etiqueta} no encontrado` });
        if (!registro.foto) return res.json({ success: true });

        await Modelo.setFoto(id, null);
        borrarArchivo(req, registro.foto);
        await registrarBitacora({
          tabla, idregistro: id, accion: 'MODIFICAR',
          descripcion: `Fotografía eliminada: ${registro.nombre_completo}`,
          valoresAntes: { foto: registro.foto }, valoresDespues: { foto: null }, req,
        });
        res.json({ success: true });
      } catch (err) { next(err); }
    },
  };
}

module.exports = { crearControladorFoto };

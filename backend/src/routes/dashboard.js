const router = require('express').Router();
const auth   = require('../middleware/auth');
const { pool } = require('../config/database');
const PadreModel      = require('../models/padreModel');
const EstudianteModel = require('../models/estudianteModel');
const { tienePermiso } = require('../middleware/checkPermiso');

router.use(auth);

// GET /api/dashboard/resumen — contadores de la pantalla de inicio; cada bloque
// solo se incluye si el usuario puede listar ese módulo.
router.get('/resumen', async (req, res, next) => {
  try {
    const codigo = req.user.codigo;
    const [verPadres, verEstudiantes, verBitacora] = await Promise.all([
      tienePermiso(codigo, 'padres', 'S'),
      tienePermiso(codigo, 'estudiantes', 'S'),
      tienePermiso(codigo, 'bitacora', 'S'),
    ]);

    const data = {};
    if (verPadres)      data.padres      = await PadreModel.resumen();
    if (verEstudiantes) data.estudiantes = await EstudianteModel.resumen();
    if (verPadres && verEstudiantes) {
      const [[r]] = await pool.query(
        `SELECT (SELECT COUNT(*) FROM estudiantes e WHERE e.activo = 1
                  AND NOT EXISTS (SELECT 1 FROM estudiantes_padres v WHERE v.idestudiantes = e.idestudiantes)) AS estudiantes_sin_padres`
      );
      data.estudiantes_sin_padres = r.estudiantes_sin_padres;
    }
    if (verBitacora) {
      const [rows] = await pool.query(
        `SELECT idbitacora, tabla, idregistro, accion, descripcion, usuario_nombre, fecha
           FROM sistema_bitacora ORDER BY fecha DESC, idbitacora DESC LIMIT 8`
      );
      data.actividad = rows;
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;

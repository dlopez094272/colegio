const router = require('express').Router();
const ctrl   = require('../controllers/bitacoraController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// GET /api/bitacora?tabla=padres&idregistro=5 — historial de un registro
router.get('/',    ctrl.getByRegistro);

// GET /api/bitacora/all — vista global (panel de auditoría)
router.get('/all', cp('bitacora', 'S'), ctrl.getAll);

module.exports = router;

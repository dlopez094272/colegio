const router = require('express').Router();
const ctrl   = require('../controllers/padreController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');
const { cpAny } = require('../middleware/checkPermiso');

router.use(auth);

// Búsqueda rápida: también la usa el formulario de estudiantes para asignar padres existentes
router.get('/buscar', cpAny([['padres', 'S'], ['estudiantes', 'A'], ['estudiantes', 'E']]), ctrl.buscar);

router.get('/',                    cp('padres', 'S'), ctrl.getAll);
router.get('/:id',                 cp('padres', 'S'), ctrl.getById);
router.post('/',                   cp('padres', 'A'), ctrl.create);
router.put('/:id',                 cp('padres', 'E'), ctrl.update);
router.patch('/:id/toggle-active', cp('padres', 'E'), ctrl.toggleActive);

module.exports = router;

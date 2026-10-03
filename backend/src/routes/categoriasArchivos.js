const router = require('express').Router();
const ctrl   = require('../controllers/categoriaArchivoController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// El listado solo requiere autenticación: lo consume el expediente del estudiante.
router.get('/',       ctrl.getAll);
router.post('/',      cp('categorias_archivos', 'A'), ctrl.create);
router.put('/:id',    cp('categorias_archivos', 'E'), ctrl.update);
router.delete('/:id', cp('categorias_archivos', 'D'), ctrl.delete);

module.exports = router;

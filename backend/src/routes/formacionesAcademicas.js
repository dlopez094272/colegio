const router = require('express').Router();
const ctrl   = require('../controllers/formacionAcademicaController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// El listado solo requiere autenticación: lo consume el formulario de docentes.
router.get('/',       ctrl.getAll);
router.post('/',      cp('formaciones_academicas', 'A'), ctrl.create);
router.put('/:id',    cp('formaciones_academicas', 'E'), ctrl.update);
router.delete('/:id', cp('formaciones_academicas', 'D'), ctrl.delete);

module.exports = router;

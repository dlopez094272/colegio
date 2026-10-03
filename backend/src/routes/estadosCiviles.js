const router = require('express').Router();
const ctrl   = require('../controllers/estadoCivilController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// El listado solo requiere autenticación: lo consume el formulario de padres.
router.get('/',       ctrl.getAll);
router.post('/',      cp('estados_civiles', 'A'), ctrl.create);
router.put('/:id',    cp('estados_civiles', 'E'), ctrl.update);
router.delete('/:id', cp('estados_civiles', 'D'), ctrl.delete);

module.exports = router;

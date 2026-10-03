const router = require('express').Router();
const ctrl   = require('../controllers/usuarioCrudController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);
router.get('/',                     cp('usuarios', 'S'), ctrl.getAll);
router.get('/:id',                  cp('usuarios', 'S'), ctrl.getById);
router.post('/',                    cp('usuarios', 'A'), ctrl.create);
router.put('/:id',                  cp('usuarios', 'E'), ctrl.update);
router.patch('/:id/toggle-active',  cp('usuarios', 'E'), ctrl.toggleActive);
router.put('/:id/password',         cp('usuarios', 'E'), ctrl.changePassword);

module.exports = router;

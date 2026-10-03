const router = require('express').Router();
const ctrl   = require('../controllers/pagoController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// Cobro: buscar padre/estudiante y traer sus cuotas pendientes
router.get('/buscar',     cp('pagos', 'A'), ctrl.buscar);
router.get('/pendientes', cp('pagos', 'A'), ctrl.pendientes);

router.get('/',            cp('pagos', 'S'), ctrl.getAll);
router.get('/:id',         cp('pagos', 'S'), ctrl.getById);
router.get('/:id/recibo',  cp('pagos', 'S'), ctrl.reciboPdf);
router.post('/',           cp('pagos', 'A'), ctrl.create);
router.post('/:id/anular', cp('pagos', 'D'), ctrl.anular);

module.exports = router;

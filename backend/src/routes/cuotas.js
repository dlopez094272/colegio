const router = require('express').Router();
const ctrl   = require('../controllers/cuotaController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// Configuración por ciclo escolar y montos por grado
router.get('/ciclos',                 cp('cuotas', 'S'), ctrl.ciclos);
router.post('/ciclos/copiar',         cp('cuotas', 'A'), ctrl.copiarCiclo);
router.get('/ciclos/:ciclo',          cp('cuotas', 'S'), ctrl.ciclo);
router.post('/ciclos/:ciclo/cuotas',  cp('cuotas', 'A'), ctrl.agregarAlCiclo);
router.put('/ciclos/:ciclo/montos',   cp('cuotas', 'E'), ctrl.guardarMontos);
router.post('/config/:id/impacto',    cp('cuotas', 'E'), ctrl.impactoConfig);
router.put('/config/:id',             cp('cuotas', 'E'), ctrl.updateConfig);
router.delete('/config/:id',          cp('cuotas', 'D'), ctrl.deleteConfig);

// Catálogo global
router.get('/',       cp('cuotas', 'S'), ctrl.getAll);
router.post('/',      cp('cuotas', 'A'), ctrl.create);
router.put('/:id',    cp('cuotas', 'E'), ctrl.update);
router.delete('/:id', cp('cuotas', 'D'), ctrl.delete);

module.exports = router;

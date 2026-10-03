const router = require('express').Router();
const ctrl   = require('../controllers/inscripcionController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');
const { cpAny } = require('../middleware/checkPermiso');

router.use(auth);

// Datos para el formulario de inscripción
router.get('/opciones',        cpAny([['inscripciones', 'S'], ['inscripciones', 'A']]), ctrl.opciones);
router.get('/cuotas-grado',    cpAny([['inscripciones', 'A'], ['inscripciones', 'E']]), ctrl.cuotasGrado);
router.get('/estudiante/:id',  cpAny([['inscripciones', 'A'], ['inscripciones', 'E']]), ctrl.contextoEstudiante);

// Cuotas individuales del estado de cuenta (anular por beca/ingreso tardío, restaurar)
router.patch('/cargos/:idCargo/anular',    cp('inscripciones', 'E'), ctrl.anularCargo);
router.patch('/cargos/:idCargo/restaurar', cp('inscripciones', 'E'), ctrl.restaurarCargo);

router.get('/',            cp('inscripciones', 'S'), ctrl.getAll);
router.get('/:id',         cp('inscripciones', 'S'), ctrl.getById);
router.post('/',           cp('inscripciones', 'A'), ctrl.create);
router.put('/:id',         cp('inscripciones', 'E'), ctrl.update);
router.post('/:id/anular', cp('inscripciones', 'D'), ctrl.anular);

// Estado de cuenta: lo consulta secretaría (inscripciones) y caja (pagos)
const verCuenta = cpAny([['inscripciones', 'S'], ['pagos', 'S']]);
router.get('/:id/estado-cuenta',     verCuenta, ctrl.estadoCuenta);
router.get('/:id/estado-cuenta/pdf', verCuenta, ctrl.estadoCuentaPdf);
router.post('/:id/cargos',           cp('inscripciones', 'E'), ctrl.agregarCuotas);

// Contrato: el generado (para imprimir y firmar) y el firmado escaneado (storage privado)
router.get('/:id/contrato',            cp('inscripciones', 'S'), ctrl.contratoPdf);
router.get('/:id/contrato-firmado',    cp('inscripciones', 'S'), ctrl.descargarContrato);
router.post('/:id/contrato-firmado',   cpAny([['inscripciones', 'A'], ['inscripciones', 'E']]), ctrl.recibirContrato, ctrl.subirContrato);
router.delete('/:id/contrato-firmado', cp('inscripciones', 'E'), ctrl.quitarContrato);

module.exports = router;

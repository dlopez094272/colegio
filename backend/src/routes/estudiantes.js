const router = require('express').Router();
const ctrl   = require('../controllers/estudianteController');
const EstudianteModel = require('../models/estudianteModel');
const { crearControladorFoto } = require('../controllers/fotoControllerFactory');
const arch   = require('../controllers/estudianteArchivoController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');
const { cpAny } = require('../middleware/checkPermiso');

const foto = crearControladorFoto({ tabla: 'estudiantes', carpeta: 'estudiantes', etiqueta: 'Estudiante', Modelo: EstudianteModel });

router.use(auth);

// Búsqueda rápida: también la usa el formulario de padres para asignar estudiantes existentes
router.get('/buscar', cpAny([['estudiantes', 'S'], ['padres', 'A'], ['padres', 'E'], ['inscripciones', 'A']]), ctrl.buscar);

router.get('/',                    cp('estudiantes', 'S'), ctrl.getAll);
router.get('/:id',                 cp('estudiantes', 'S'), ctrl.getById);
router.post('/',                   cp('estudiantes', 'A'), ctrl.create);
router.put('/:id',                 cp('estudiantes', 'E'), ctrl.update);
router.patch('/:id/toggle-active', cp('estudiantes', 'E'), ctrl.toggleActive);

// Fotografía: se sube después de crear el registro (necesita su id)
router.post('/:id/foto',   cpAny([['estudiantes', 'A'], ['estudiantes', 'E']]), foto.recibir, foto.subir);
router.delete('/:id/foto', cp('estudiantes', 'E'), foto.quitar);

// Expediente de archivos (partida de nacimiento, certificados...): igual que la
// foto, se sube después de crear el registro. La descarga exige token.
router.get('/:id/archivos',                   cp('estudiantes', 'S'), arch.listar);
router.get('/:id/archivos/:idArchivo',        cp('estudiantes', 'S'), arch.descargar);
router.post('/:id/archivos',                  cpAny([['estudiantes', 'A'], ['estudiantes', 'E']]), arch.recibir, arch.subir);
router.delete('/:id/archivos/:idArchivo',     cp('estudiantes', 'E'), arch.eliminar);

module.exports = router;

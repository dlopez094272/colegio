const router = require('express').Router();
const ctrl   = require('../controllers/docenteController');
const DocenteModel = require('../models/docenteModel');
const { crearControladorFoto } = require('../controllers/fotoControllerFactory');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');
const { cpAny } = require('../middleware/checkPermiso');

const foto = crearControladorFoto({ tabla: 'docentes', carpeta: 'docentes', etiqueta: 'Docente', Modelo: DocenteModel });

router.use(auth);

router.get('/',                    cp('docentes', 'S'), ctrl.getAll);
router.get('/:id',                 cp('docentes', 'S'), ctrl.getById);
router.post('/',                   cp('docentes', 'A'), ctrl.create);
router.put('/:id',                 cp('docentes', 'E'), ctrl.update);
router.patch('/:id/toggle-active', cp('docentes', 'E'), ctrl.toggleActive);

// Fotografía: se sube después de crear el registro (necesita su id)
router.post('/:id/foto',   cpAny([['docentes', 'A'], ['docentes', 'E']]), foto.recibir, foto.subir);
router.delete('/:id/foto', cp('docentes', 'E'), foto.quitar);

module.exports = router;

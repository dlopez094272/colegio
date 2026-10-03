const router = require('express').Router();
const ctrl   = require('../controllers/estructuraAcademicaController');
const { TIPOS } = require('../models/estructuraAcademicaModel');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

router.use(auth);

// :tipo = nivel | carrera | grado | seccion
router.param('tipo', (req, res, next, tipo) => (TIPOS[tipo] ? next() : res.status(404).json({ message: 'Tipo no válido' })));

router.get('/arbol',             cp('estructura_academica', 'S'), ctrl.arbol);
router.post('/:tipo',            cp('estructura_academica', 'A'), ctrl.create);
router.put('/:tipo/:id',         cp('estructura_academica', 'E'), ctrl.update);
router.patch('/:tipo/:id/estado', cp('estructura_academica', 'E'), ctrl.estado);
router.delete('/:tipo/:id',      cp('estructura_academica', 'D'), ctrl.delete);

module.exports = router;

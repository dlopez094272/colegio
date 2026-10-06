const router = require('express').Router();
const ctrl   = require('../controllers/configuracionController');
const auth   = require('../middleware/auth');
const cp     = require('../middleware/checkPermiso');

// Nombre y logotipo para la pantalla de login (sin sesión)
router.get('/publica', ctrl.publica);

router.use(auth);

// Datos del colegio para el dashboard y opciones de correo (cualquier usuario con sesión)
router.get('/resumen', ctrl.resumen);

router.get('/',                cp('configuracion', 'S'), ctrl.get);
router.put('/',                cp('configuracion', 'E'), ctrl.update);
router.post('/probar-correo',  cp('configuracion', 'E'), ctrl.probarCorreo);

router.post('/logo',   cp('configuracion', 'E'), ctrl.recibirImagen, ctrl.subirLogo);
router.delete('/logo', cp('configuracion', 'E'), ctrl.quitarLogo);
router.get('/firma',    cp('configuracion', 'S'), ctrl.verFirma);
router.post('/firma',   cp('configuracion', 'E'), ctrl.recibirImagen, ctrl.subirFirma);
router.delete('/firma', cp('configuracion', 'E'), ctrl.quitarFirma);

module.exports = router;

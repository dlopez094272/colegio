const router = require('express').Router();
const ctrl   = require('../controllers/seguridadController');
const auth   = require('../middleware/auth');
const sa     = require('../middleware/superAdmin');

router.use(auth, sa);

// Grupos
router.get('/groups',         ctrl.getGroups);
router.post('/groups',        ctrl.createGroup);
router.put('/groups/:id',     ctrl.updateGroup);
router.delete('/groups/:id',  ctrl.deleteGroup);

// Usuarios con grupos (vista del módulo seguridad)
router.get('/users-groups',   ctrl.getUsersWithGroups);
router.post('/toggle-member', ctrl.toggleMember);

// Tablas del sistema
router.get('/tables',               ctrl.getTables);
router.get('/rights/:groupId',      ctrl.getRights);
router.post('/rights/:groupId',     ctrl.saveRights);
router.post('/copy-rights',         ctrl.copyRights);

module.exports = router;

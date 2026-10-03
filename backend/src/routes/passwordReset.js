const router = require('express').Router();
const ctrl   = require('../controllers/passwordResetController');
const auth   = require('../middleware/auth');

router.post('/request-reset',        ctrl.requestReset);
router.get('/verify-token/:token',   ctrl.verifyToken);
router.post('/reset-password',       ctrl.resetPassword);
router.post('/change-primer', auth,  ctrl.changePrimer);

module.exports = router;

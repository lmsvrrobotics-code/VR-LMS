const router = require('express').Router();
const ctrl = require('../controllers/AuthController');
const { adminOnly } = require('../middlewares/auth');
const { validateBody, schemas } = require('../lib/validators');

router.post('/auth/login', validateBody(schemas.adminLogin), ctrl.login);
router.get('/auth/me', adminOnly, ctrl.me);
router.post('/auth/logout', adminOnly, ctrl.logout);

module.exports = router;

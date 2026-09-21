const router = require('express').Router();
const ctrl = require('../controllers/AuthController');
const { adminAuthed } = require('../middlewares/auth');
const { validateBody, schemas } = require('../lib/validators');

router.post('/auth/login', validateBody(schemas.adminLogin), ctrl.login);
// Reachable without approval: the UI reads is_root_admin from /auth/me to
// decide whether to render the access-pending notice, and an unapproved admin
// must still be able to log out.
router.get('/auth/me', adminAuthed, ctrl.me);
router.post('/auth/logout', adminAuthed, ctrl.logout);

module.exports = router;

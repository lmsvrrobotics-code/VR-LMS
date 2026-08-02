const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/AdminController');
const dash = require('../controllers/DashboardController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

router.get('/dashboard', dash.index);

router.get('/admins', ctrl.index);
router.get('/admins/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/admins', upload.single('photo'), validateBody(schemas.createAdmin), ctrl.store);
// Grant/revoke full root-dashboard access (root admin only — enforced in ctrl).
router.post('/admins/:id/grant-access', validateParams(schemas.idParam), ctrl.grantAccess);
router.post('/admins/:id/revoke-access', validateParams(schemas.idParam), ctrl.revokeAccess);
router.post('/admins/:id', validateParams(schemas.idParam), upload.single('photo'), validateBody(schemas.updateAdmin), ctrl.update);
router.delete('/admins/:id', validateParams(schemas.idParam), ctrl.destroy);

module.exports = router;

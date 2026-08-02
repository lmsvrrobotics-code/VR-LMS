const router = require('express').Router();
const ctrl = require('../controllers/LocationController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// JSON CRUD (no file upload — photo/map are URL fields). Mirrors gallery.routes
// but without multer. Mounted under /api/admin behind adminOnly in server.js.
router.get('/locations', ctrl.index);
router.get('/locations/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/locations/store', validateBody(schemas.createLocation), ctrl.store);
router.post('/locations/update/:id', validateParams(schemas.idParam), validateBody(schemas.updateLocation), ctrl.update);
router.delete('/locations/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/locations/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;

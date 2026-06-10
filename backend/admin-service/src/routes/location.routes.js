const router = require('express').Router();
const ctrl = require('../controllers/LocationController');

// JSON CRUD (no file upload — photo/map are URL fields). Mirrors gallery.routes
// but without multer. Mounted under /api/admin behind adminOnly in server.js.
router.get('/locations', ctrl.index);
router.get('/locations/edit/:id', ctrl.show);
router.post('/locations/store', ctrl.store);
router.post('/locations/update/:id', ctrl.update);
router.delete('/locations/delete/:id', ctrl.delete);
router.get('/locations/status/:id', ctrl.status);

module.exports = router;

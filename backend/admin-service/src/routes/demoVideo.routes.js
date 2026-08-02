const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/DemoVideoController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Multipart (video/image) on create + update; `media` is the file field.
router.get('/demo-videos', ctrl.index);
router.get('/demo-videos/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/demo-videos/store', upload.single('media'), validateBody(schemas.createWithTitle), ctrl.store);
router.post('/demo-videos/update/:id', validateParams(schemas.idParam), upload.single('media'), validateBody(schemas.updateWithTitle), ctrl.update);
router.delete('/demo-videos/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/demo-videos/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;

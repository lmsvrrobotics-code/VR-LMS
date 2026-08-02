const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/GalleryController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Multipart (image/video) on create + update; `media` is the file field.
router.get('/gallery', ctrl.index);
router.get('/gallery/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/gallery/store', upload.single('media'), validateBody(schemas.createGalleryItem), ctrl.store);
router.post('/gallery/update/:id', validateParams(schemas.idParam), upload.single('media'), validateBody(schemas.updateGalleryItem), ctrl.update);
router.delete('/gallery/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/gallery/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;

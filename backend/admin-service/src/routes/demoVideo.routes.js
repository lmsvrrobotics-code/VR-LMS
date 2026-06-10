const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/DemoVideoController');

// Multipart (video/image) on create + update; `media` is the file field.
router.get('/demo-videos', ctrl.index);
router.get('/demo-videos/edit/:id', ctrl.show);
router.post('/demo-videos/store', upload.single('media'), ctrl.store);
router.post('/demo-videos/update/:id', upload.single('media'), ctrl.update);
router.delete('/demo-videos/delete/:id', ctrl.delete);
router.get('/demo-videos/status/:id', ctrl.status);

module.exports = router;

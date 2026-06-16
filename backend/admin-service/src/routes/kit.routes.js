const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/KitController');

// Multipart (cover image) on create + update; `cover` is the file field.
router.get('/kits', ctrl.index);
router.get('/kits/edit/:id', ctrl.show);
router.post('/kits/store', upload.single('cover'), ctrl.store);
router.post('/kits/update/:id', upload.single('cover'), ctrl.update);
router.delete('/kits/delete/:id', ctrl.delete);
router.get('/kits/status/:id', ctrl.status);

module.exports = router;

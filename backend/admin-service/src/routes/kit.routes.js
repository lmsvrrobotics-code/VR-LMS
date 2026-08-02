const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/KitController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Multipart (cover image) on create + update; `cover` is the file field.
router.get('/kits', ctrl.index);
router.get('/kits/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/kits/store', upload.single('cover'), validateBody(schemas.createKit), ctrl.store);
router.post('/kits/update/:id', validateParams(schemas.idParam), upload.single('cover'), validateBody(schemas.updateKit), ctrl.update);
router.delete('/kits/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/kits/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;

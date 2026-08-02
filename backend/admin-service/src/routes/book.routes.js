const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/BookController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Multipart (cover image) on create + update; `cover` is the file field.
router.get('/books', ctrl.index);
router.get('/books/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/books/store', upload.single('cover'), validateBody(schemas.createBook), ctrl.store);
router.post('/books/update/:id', validateParams(schemas.idParam), upload.single('cover'), validateBody(schemas.updateBook), ctrl.update);
router.delete('/books/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/books/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;

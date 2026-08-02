const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/TeacherController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// upload.single('photo') MUST run before validateBody: multer is what parses
// multipart/form-data into req.body (express.json/urlencoded ignore it), so a
// validator placed first would see an empty body and reject every request.
// The photo file itself is accepted but not persisted yet — the auth users
// table has no photo column for teachers; harmless to receive and ignore.
// Namespaced under /manage to avoid colliding with the pre-existing
// liveclass route GET /teachers (the live-class teacher picker),
// which is registered earlier and would otherwise shadow these.
router.get('/manage/teachers', ctrl.index);
router.get('/manage/teachers/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/manage/teachers', upload.single('photo'), validateBody(schemas.createTeacher), ctrl.store);
router.post('/manage/teachers/:id', validateParams(schemas.idParam), upload.single('photo'), validateBody(schemas.updateTeacher), ctrl.update);
router.delete('/manage/teachers/:id', validateParams(schemas.idParam), ctrl.destroy);

module.exports = router;

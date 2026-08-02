const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/StudentController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

router.get('/students', ctrl.index);
// Distinct college names for the Manage Students filter dropdown. Must be
// declared before '/students/:id' so 'colleges' isn't matched as an :id.
router.get('/students/colleges', ctrl.colleges);
router.get('/students/:id', validateParams(schemas.idParam), ctrl.show);
// Manage Students → Program Request column "Send" button.
router.post('/students/:id/program-request', validateParams(schemas.idParam), ctrl.programRequest);
router.post('/students', upload.single('photo'), validateBody(schemas.createStudent), ctrl.store);
router.post('/students/:id', validateParams(schemas.idParam), upload.single('photo'), validateBody(schemas.updateStudent), ctrl.update);
router.delete('/students/:id', validateParams(schemas.idParam), ctrl.destroy);

module.exports = router;

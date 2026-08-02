const router = require('express').Router();
const joi = require('joi');
const ctrl = require('../controllers/CourseController');
const upload = require('../middlewares/multer');
const { adminOnly, adminOrTeacher } = require('../middlewares/auth');
const { validateBody, validateParams, schemas } = require('../lib/validators');

const mediaFields = upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'preview', maxCount: 1 },
    { name: 'og_image', maxCount: 1 },
]);

// Mounted via `app.use('/api/admin', auth, courseRoutes)` in server.js — the
// `auth` middleware decodes the JWT, then each route applies its own role gate:
//   - read endpoints (list, edit-meta)          → admin OR teacher
//     (CourseService.list/edit scope to the teacher's own courses)
//   - everything else (create, update, delete,
//     duplicate, status, approval)              → admin only

router.get('/courses', adminOrTeacher, ctrl.index);
router.get('/course/create', adminOnly, ctrl.create);
// multer (mediaFields) MUST run before validateBody: the request is
// multipart/form-data, so req.body is only populated after multer parses it.
// Validating first sees an empty body and 400s on required name/slug.
router.post('/course/store', adminOnly, mediaFields, validateBody(schemas.createCourse), ctrl.store);
router.get('/course/edit/:id', adminOrTeacher, validateParams(schemas.idParam), ctrl.edit);
// `update` handles the per-tab admin form (Basic, Pricing, etc). Teachers
// don't see those tabs (Edit.jsx filters them) and have no need to call this —
// keep it admin-only.
router.post('/course/update/:id', adminOnly, validateParams(schemas.idParam), mediaFields, validateBody(schemas.updateCourse), ctrl.update);
router.get('/course/duplicate/:id', adminOnly, validateParams(schemas.idParam), ctrl.duplicate);
router.get('/course/status/:type/:id', adminOnly, validateParams(schemas.typeAndIdParams), ctrl.status);
router.delete('/course/delete/:id', adminOnly, validateParams(schemas.idParam), ctrl.delete);
router.get('/course/draft/:id', adminOnly, validateParams(schemas.idParam), ctrl.draft);
router.post('/course/approval/:id', adminOnly, validateParams(schemas.idParam), validateBody(joi.object({
  subject: joi.string().required(),
  message: joi.string().required(),
})), ctrl.approval);

module.exports = router;

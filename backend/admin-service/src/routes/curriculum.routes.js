const router = require('express').Router();
const multer = require('multer');
const ctrl = require('../controllers/CurriculumController');
const { adminOrTeacher } = require('../middlewares/auth');

const upload = multer({ dest: 'tmp/' });

const lessonFiles = upload.fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'scorm_file', maxCount: 1 },
    { name: 'system_video_file', maxCount: 1 },
    // Class cover image — stored on lessons.thumbnail, distinct from
    // `attachment` (which for an image-type lesson IS the lesson content).
    { name: 'thumbnail', maxCount: 1 },
]);

// All curriculum endpoints are usable by both admins and teachers. The
// service layer should additionally scope writes to courses the teacher
// owns / is assigned to — same model the zoom-live-class module uses.

// Sections (presented as "Sessions" in the admin UI) — the cover image makes
// these multipart, so they run through the same multer instance as lessons.
const sessionFiles = upload.fields([{ name: 'image', maxCount: 1 }]);

router.get('/course/:course_id/curriculum', adminOrTeacher, ctrl.sections_by_course);
router.post('/section', adminOrTeacher, sessionFiles, ctrl.section_store);
router.post('/section/update', adminOrTeacher, sessionFiles, ctrl.section_update);
router.get('/section/delete/:id', adminOrTeacher, ctrl.section_delete);
router.post('/section/sort', adminOrTeacher, ctrl.section_sort);

// Lessons
router.post('/lesson', adminOrTeacher, lessonFiles, ctrl.lesson_store);
router.post('/lesson/edit', adminOrTeacher, lessonFiles, ctrl.lesson_update);
router.get('/lesson/:id', adminOrTeacher, ctrl.lesson_show);
router.get('/lesson/delete/:id', adminOrTeacher, ctrl.lesson_delete);
router.post('/lesson/sort', adminOrTeacher, ctrl.lesson_sort);

// Direct-to-Bunny video upload: mint a presigned TUS ticket, then poll status.
router.post('/video/create-upload', adminOrTeacher, ctrl.video_create_upload);
router.get('/video/:guid/status', adminOrTeacher, ctrl.video_status);

module.exports = router;

const curriculumService = require('../services/CurriculumService');
const { asyncHandler } = require('../middlewares/error');

// Sections

exports.sections_by_course = asyncHandler(async (req, res) => {
    res.json(await curriculumService.listByCourse(req.params.course_id));
});

// Sessions accept an optional cover image, so body + files both flow through.
exports.section_store = asyncHandler(async (req, res) => {
    const result = await curriculumService.createSection({ body: req.body, files: req.files });
    res.status(201).json(result);
});

exports.section_update = asyncHandler(async (req, res) => {
    res.json(await curriculumService.updateSection({ body: req.body, files: req.files }));
});

exports.section_delete = asyncHandler(async (req, res) => {
    res.json(await curriculumService.deleteSection(req.params.id));
});

exports.section_sort = asyncHandler(async (req, res) => {
    const ids = req.body.itemJSON || req.body.ids || [];
    res.json(await curriculumService.sortSections(ids));
});

// Lessons

exports.lesson_store = asyncHandler(async (req, res) => {
    const result = await curriculumService.createLesson({ body: req.body, files: req.files });
    res.status(201).json(result);
});

exports.lesson_update = asyncHandler(async (req, res) => {
    res.json(await curriculumService.updateLesson({ body: req.body, files: req.files }));
});

exports.lesson_show = asyncHandler(async (req, res) => {
    res.json(await curriculumService.showLesson(req.params.id));
});

exports.lesson_delete = asyncHandler(async (req, res) => {
    res.json(await curriculumService.deleteLesson(req.params.id));
});

exports.lesson_sort = asyncHandler(async (req, res) => {
    const ids = req.body.itemJSON || req.body.ids || [];
    res.json(await curriculumService.sortLessons(ids));
});

// Direct-to-Bunny video upload

exports.video_create_upload = asyncHandler(async (req, res) => {
    res.json(await curriculumService.createVideoUpload(req.body.title, req.body.course_id));
});

exports.video_status = asyncHandler(async (req, res) => {
    res.json(await curriculumService.getVideoStatus(req.params.guid));
});

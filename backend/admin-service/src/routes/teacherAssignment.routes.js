// Teacher assignment workflow. Mounted in server.js with `adminOrTeacher`
// ABOVE the adminOnly block — those mounts are bare `/api/admin` middleware
// that 403 a teacher before Express looks for a matching route down there.
//
// Authorization is enforced per-request in TeacherAssignmentService: every
// handler checks the caller actually teaches the batch involved.
const joi = require('joi');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = require('express').Router();
const svc = require('../services/TeacherAssignmentService');
const { asyncHandler } = require('../middlewares/error');
const { validateBody, validateParams } = require('../lib/validators');
const { auditLog } = require('../lib/logger');

// Batch keys are strings like "VR-B-00001", so the shared numeric idParam
// schema would reject every real batch.
const idParam = joi.object({ id: joi.number().integer().positive().required() });

const createBody = joi.object({
    batch_id: joi.string().max(100).required(),
    title: joi.string().min(2).max(200).required(),
    description: joi.string().allow('', null).max(4000),
    instructions: joi.string().allow('', null).max(8000),
    // Multipart sends everything as strings, so due_date/max_score arrive as
    // text; joi coerces both. `links` is a JSON array (or newline list) of URLs
    // the teacher pasted — parsed and sanitised in assignmentLogic.
    due_date: joi.date().allow('', null),
    max_score: joi.number().integer().min(1).max(1000).default(100),
    file_url: joi.string().uri().allow('', null),
    links: joi.any(),
    attachments_title: joi.string().max(200).allow('', null),
});

const gradeBody = joi.object({
    score: joi.number().min(0).required(),
    feedback: joi.string().allow('', null).max(4000),
});

// The teacher's own assignments + the batches they can post to.
router.get('/teacher-assignments', asyncHandler(async (req, res) => {
    res.json(await svc.listForTeacher(req.user.id));
}));

// Roster + every student's response for one assignment (the grading screen).
router.get('/teacher-assignments/:id/submissions', validateParams(idParam), asyncHandler(async (req, res) => {
    res.json(await svc.submissionsForAssignment(req.params.id, req.user.id, req.user.role));
}));

// Attachments: up to 10 PDFs/images/docs per assignment. `attachments` MUST be
// parsed by multer BEFORE validateBody — the request is multipart/form-data, so
// req.body is empty until multer runs (see tests/multipartValidation.test.js
// for the regression this ordering guards against).
const ALLOWED_ATTACHMENT = /^(image\/(png|jpe?g|pjpeg|gif|webp|svg\+xml)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-|text\/plain|application\/zip|application\/x-zip-compressed)/i;

// Windows reports no MIME type (or a generic application/octet-stream) for a
// file whose extension has no registered association — a perfectly good PDF
// then got rejected with "Only PDFs, images, documents…". When the browser is
// vague, fall back to the extension rather than refusing the teacher's file.
const ALLOWED_EXTENSION = /\.(pdf|png|jpe?g|gif|webp|svg|docx?|xlsx?|pptx?|txt|zip)$/i;
const VAGUE_MIME = /^(application\/octet-stream)?$/i;

const isAllowedAttachment = (file) => {
    const mime = String(file?.mimetype || '').trim();
    if (ALLOWED_ATTACHMENT.test(mime)) return true;
    // Only trust the extension when the browser gave us nothing useful; never
    // let a .pdf extension launder an explicitly-declared executable type.
    return VAGUE_MIME.test(mime) && ALLOWED_EXTENSION.test(String(file?.originalname || ''));
};

// Same disk-storage rules as middlewares/multer.js: basename-only filenames so
// a crafted originalname can't traverse out of tmp/.
const tmpDir = path.join(__dirname, '..', '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const attachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => {
        const safe = path.basename(file.originalname || 'upload').replace(/[/\\]/g, '_');
        cb(null, `${Date.now()}-${safe}`);
    },
});

const attachmentUpload = multer({
    storage: attachmentStorage,
    limits: { fileSize: 25 * 1024 * 1024, files: 20 },
    // Reject executables etc. up front so they never reach R2.
    fileFilter: (req, file, cb) => {
        if (isAllowedAttachment(file)) return cb(null, true);
        cb(new Error(`"${file.originalname || 'file'}" can't be attached — only PDFs, images, documents and zip files are allowed`));
    },
}).array('attachments', 20);

// Wrap multer so its errors (file too large / wrong type) surface as a clean
// 400 instead of a 500 from the generic error handler.
const withAttachments = (req, res, next) => attachmentUpload(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each attachment must be 25MB or smaller'
        : err.message || 'Attachment upload failed';
    return res.status(400).json({ error: msg });
});

router.post('/teacher-assignments', withAttachments, validateBody(createBody), asyncHandler(async (req, res) => {
    const a = await svc.create(req.body, req.user.id, req.user.role, req.files || []);
    const failed = a.failed_attachments || [];
    auditLog('ASSIGNMENT_CREATED', {
        assignment_id: a.id, batch_id: a.batch_id, attachments: (a.attachments || []).length,
        failed_attachments: failed.length,
    }, req.user.id);
    // 201 either way — the assignment WAS created. `warning` lets the teacher
    // know some material didn't upload instead of a bare success message.
    res.status(201).json({
        assignment: a,
        ...(failed.length ? {
            warning: `Assignment created, but ${failed.length} file${failed.length === 1 ? '' : 's'} could not be uploaded: ${failed.join(', ')}. Please try attaching ${failed.length === 1 ? 'it' : 'them'} again.`,
        } : {}),
    });
}));

router.delete('/teacher-assignments/:id', validateParams(idParam), asyncHandler(async (req, res) => {
    const out = await svc.remove(req.params.id, req.user.id, req.user.role);
    auditLog('ASSIGNMENT_DELETED', { assignment_id: out.id }, req.user.id);
    res.json(out);
}));

router.patch('/teacher-submissions/:id/grade', validateParams(idParam), validateBody(gradeBody), asyncHandler(async (req, res) => {
    const s = await svc.grade(req.params.id, req.body, req.user.id, req.user.role);
    auditLog('SUBMISSION_GRADED', { submission_id: s.id, score: s.score }, req.user.id);
    res.json({ submission: s });
}));

module.exports = router;
// Exported for tests/attachmentFileFilter.test.js — the accept/reject decision
// is what silently blocked teachers from attaching PDFs and images.
module.exports.isAllowedAttachment = isAllowedAttachment;

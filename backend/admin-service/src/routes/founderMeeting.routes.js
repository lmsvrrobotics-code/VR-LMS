const router = require('express').Router();
const upload = require('../middlewares/multer');
const ctrl = require('../controllers/FounderMeetingController');
const { validateParams, schemas } = require('../lib/validators');

// Two separate file fields so the destination (Bunny vs R2) is known from the
// field name instead of sniffed from the mimetype.
const media = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'poster', maxCount: 1 },
]);

// NOTE: no validateBody here. These are multipart requests, and the field
// rules live in lib/founderMeeting (applied inside the service) so the same
// validation covers both create and update, including the partial semantics
// an update needs.
router.get('/founder-meetings', ctrl.index);
router.get('/founder-meetings/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/founder-meetings/store', media, ctrl.store);
router.post('/founder-meetings/update/:id', validateParams(schemas.idParam), media, ctrl.update);
router.delete('/founder-meetings/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/founder-meetings/status/:id', validateParams(schemas.idParam), ctrl.status);

// Who registered for a meeting, and the attended/no-show workflow.
router.get('/founder-meetings/:id/registrations', validateParams(schemas.idParam), ctrl.registrations);
router.post('/founder-meetings/registrations/:id/status', validateParams(schemas.idParam), ctrl.registrationStatus);
router.delete('/founder-meetings/registrations/:id', validateParams(schemas.idParam), ctrl.deleteRegistration);

module.exports = router;

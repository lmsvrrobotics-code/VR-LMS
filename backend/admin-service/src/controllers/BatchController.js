const batchService = require('../services/BatchService');
const { asyncHandler } = require('../middlewares/error');
const { auditLog } = require('../lib/logger');

// EVERY BatchService method takes a single OPTIONS OBJECT — { clgId, id, body }
// — never positional args. This controller previously passed positional values
// and dropped clgId entirely, so the service read `body?.name` off a plain body
// object (=> "Batch name is required" on a form that clearly sent one) and
// scoped every query to clg_id undefined. Batches are college-scoped: clgId
// rides on the query string (?clgId=independent for no-school batches), so it
// must be forwarded on every call.
const scope = (req) => req.query.clgId;

exports.index = asyncHandler(async (req, res) => {
  const result = await batchService.list({ clgId: scope(req) });
  res.json(result);
});

exports.store = asyncHandler(async (req, res) => {
  const result = await batchService.create({ clgId: scope(req), body: req.body });
  res.status(201).json(result);
});

// get() already returns { batch }. Wrapping it again produced
// { batch: { batch: {...} } }, so the client's `res.batch.students` was
// undefined and the Students modal rendered empty. Pass the service payload
// through as-is.
exports.show = asyncHandler(async (req, res) => {
  const result = await batchService.get({ clgId: scope(req), id: req.params.id });
  res.json(result);
});

// Same as show(): the service already returns { message, batch }, so these pass
// it straight through rather than nesting it under another `batch` key.
exports.update = asyncHandler(async (req, res) => {
  const result = await batchService.update({ clgId: scope(req), id: req.params.id, body: req.body });
  res.json(result);
});

exports.delete = asyncHandler(async (req, res) => {
  await batchService.remove({ clgId: scope(req), id: req.params.id });
  res.json({ message: 'Batch deleted successfully' });
});

exports.addStudents = asyncHandler(async (req, res) => {
  const result = await batchService.addMembers({ clgId: scope(req), id: req.params.id, body: req.body });
  res.json(result);
});

exports.removeStudent = asyncHandler(async (req, res) => {
  const result = await batchService.removeMember({
    clgId: scope(req),
    id: req.params.id,
    userId: req.params.studentId,
  });
  res.json(result);
});

exports.addTeachers = asyncHandler(async (req, res) => {
  const result = await batchService.addTeachers({ clgId: scope(req), id: req.params.id, body: req.body });
  res.json(result);
});

exports.removeTeacher = asyncHandler(async (req, res) => {
  const result = await batchService.removeTeacher({
    clgId: scope(req),
    id: req.params.id,
    userId: req.params.teacherId,
  });
  res.json(result);
});

exports.listEligibleTeachers = asyncHandler(async (req, res) => {
  const result = await batchService.eligibleTeachers({ clgId: scope(req) });
  res.json(result);
});

exports.listEligibleStudents = asyncHandler(async (req, res) => {
  // eligibleStudents takes an OPTIONS OBJECT, not a bare clgId. Passing the
  // string meant it destructured `{ clgId }` out of a plain value — and out of
  // `undefined` when no school was picked ("Independent students"), which threw
  // and surfaced as a 500 where the student picker should be.
  const result = await batchService.eligibleStudents({ clgId: req.query.clgId });
  res.json(result);
});

exports.assignTemporaryTeacher = asyncHandler(async (req, res) => {
  const { temporary_teacher_id } = req.body;
  const result = await batchService.assignTemporaryTeacher(req.params.id, req.params.classId, temporary_teacher_id);
  res.json({ message: 'Temporary teacher assigned', result });
});

// Teacher unlocks one lesson for their batch. Until this runs, the lesson is
// locked in the student's player and its video/attachment is withheld.
exports.releaseLesson = asyncHandler(async (req, res) => {
  const { lesson_id } = req.body;
  const result = await batchService.releaseLesson(
    req.params.id, lesson_id, req.user.id, req.user.role
  );
  auditLog('LESSON_RELEASED', { batch_id: result.batch_id, lesson_id: result.lesson_id }, req.user.id);
  res.json({ message: 'Lesson released to batch', result });
});

// Re-lock a previously released lesson for the batch.
exports.revokeLesson = asyncHandler(async (req, res) => {
  const { lesson_id } = req.body;
  const result = await batchService.revokeLesson(
    req.params.id, lesson_id, req.user.id, req.user.role
  );
  auditLog('LESSON_REVOKED', { batch_id: result.batch_id, lesson_id: result.lesson_id }, req.user.id);
  res.json({ message: 'Lesson revoked for batch', result });
});

// Which lessons are currently released for this batch (drives the teacher UI).
exports.listReleases = asyncHandler(async (req, res) => {
  const result = await batchService.listReleases(req.params.id, req.user.id, req.user.role);
  res.json(result);
});

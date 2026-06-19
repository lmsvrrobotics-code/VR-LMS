const batchService = require('../services/BatchService');
const { asyncHandler } = require('../middlewares/error');

exports.index = asyncHandler(async (req, res) => {
  const result = await batchService.list(req.query);
  res.json(result);
});

exports.store = asyncHandler(async (req, res) => {
  const batch = await batchService.create(req.body);
  res.status(201).json({ message: 'Batch created successfully', batch });
});

exports.show = asyncHandler(async (req, res) => {
  const batch = await batchService.get(req.params.id);
  res.json({ batch });
});

exports.update = asyncHandler(async (req, res) => {
  const batch = await batchService.update(req.params.id, req.body);
  res.json({ message: 'Batch updated successfully', batch });
});

exports.delete = asyncHandler(async (req, res) => {
  await batchService.remove(req.params.id);
  res.json({ message: 'Batch deleted successfully' });
});

exports.addStudents = asyncHandler(async (req, res) => {
  const { student_ids } = req.body;
  const batch = await batchService.addMembers(req.params.id, student_ids);
  res.json({ message: 'Students added to batch', batch });
});

exports.removeStudent = asyncHandler(async (req, res) => {
  const batch = await batchService.removeMember(req.params.id, req.params.studentId);
  res.json({ message: 'Student removed from batch', batch });
});

exports.listEligibleStudents = asyncHandler(async (req, res) => {
  const { clgId } = req.query;
  const result = await batchService.eligibleStudents(clgId);
  res.json(result);
});

exports.assignTemporaryTeacher = asyncHandler(async (req, res) => {
  const { temporary_teacher_id } = req.body;
  const result = await batchService.assignTemporaryTeacher(req.params.id, req.params.classId, temporary_teacher_id);
  res.json({ message: 'Temporary teacher assigned', result });
});

exports.releaseLesson = asyncHandler(async (req, res) => {
  const { lesson_id } = req.body;
  const result = await batchService.releaseLesson(req.params.id, lesson_id, req.user.id);
  res.json({ message: 'Lesson released to batch', result });
});

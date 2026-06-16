// Cross-schema integrity sweeps.
//
// lms_admin keys students by a varchar user_id that points at
// lucy_devdb.users with NO foreign key (the schemas are linked by code, not
// constraints), and several tables reference courses/batches through JSONB id
// arrays. That means deletes need explicit cleanup or they strand orphan rows
// and stale array ids. These sweeps run inside the delete flows
// (StudentService.remove, CourseService.remove, BatchService.remove) and are
// BEST-EFFORT: a sweep failure is logged but never blocks the delete itself —
// orphans are inert (every reader filters defensively), just untidy.
const { sequelize, Program, Course, UserProgress, LessonCompletion, LessonWatchProgress,
    QuizSubmission, Certificate, StudentRecord, StudentLearning, TeacherFeedback,
    FeedbackResponse, BatchMember, AssignmentMember, TeachingAssignment, LessonRelease,
} = require('../models');

// Remove one id from a JSONB id-array column on every row that contains it.
// Done in JS (fetch → filter → save) rather than jsonb_path SQL because the
// arrays are small (a program lists a handful of ids), may mix number/string
// element types, and row counts are tiny — correctness beats cleverness here.
const scrubArrayColumn = async (Model, column, id) => {
    const target = String(id);
    const rows = await Model.findAll({ attributes: ['id', column] });
    let scrubbed = 0;
    for (const row of rows) {
        const arr = row[column];
        if (!Array.isArray(arr)) continue;
        const next = arr.filter((v) => String(v) !== target);
        if (next.length !== arr.length) {
            await row.update({ [column]: next });
            scrubbed += 1;
        }
    }
    return scrubbed;
};

// All lms_admin rows owned by ONE student. Called when the student's auth
// profile is deleted (admin Manage Students → delete). Payments are kept ON
// PURPOSE: they're financial records (refund disputes, tax) — for a GDPR-style
// erasure they should be anonymised, not destroyed.
const sweepStudentData = async (userId) => {
    const uid = String(userId);
    try {
        const [completions, watch, progress, quizzes, certs, records, learnings, feedback, formResponses, batches, rosters] = await Promise.all([
            LessonCompletion.destroy({ where: { user_id: uid } }),
            LessonWatchProgress.destroy({ where: { user_id: uid } }),
            UserProgress.destroy({ where: { user_id: uid } }),
            QuizSubmission.destroy({ where: { user_id: uid } }),
            Certificate.destroy({ where: { user_id: uid } }),
            StudentRecord.destroy({ where: { student_id: uid } }),
            StudentLearning.destroy({ where: { student_id: uid } }),
            TeacherFeedback.destroy({ where: { student_id: uid } }),
            FeedbackResponse.destroy({ where: { student_id: uid } }),
            BatchMember.destroy({ where: { user_id: uid } }),
            AssignmentMember.destroy({ where: { member_type: 'student', member_ref: uid } }),
        ]);
        const total = completions + watch + progress + quizzes + certs + records + learnings + feedback + formResponses + batches + rosters;
        if (total) console.log(`[sweep] student ${uid}: removed ${total} orphan row(s) across lms_admin`);
    } catch (e) {
        console.warn(`[sweep] student ${uid} cleanup failed (non-fatal):`, e.message);
    }
};

// Everything that references ONE course beyond its own lessons/sections
// (which CourseService.remove already deletes). Progress rows, the teacher-
// delegation chain, and program JSONB arrays.
const scrubCourseRefs = async (courseId) => {
    const cid = Number(courseId);
    try {
        await Promise.all([
            UserProgress.destroy({ where: { course_id: cid } }),
            LessonCompletion.destroy({ where: { course_id: cid } }),
            LessonWatchProgress.destroy({ where: { course_id: cid } }),
        ]);
        // Delegation chain: assignments → members + releases.
        const assignments = await TeachingAssignment.findAll({ where: { course_id: cid }, attributes: ['id'], raw: true });
        const aids = assignments.map((a) => a.id);
        if (aids.length) {
            await AssignmentMember.destroy({ where: { teaching_assignment_id: aids } });
            await LessonRelease.destroy({ where: { teaching_assignment_id: aids } });
            await TeachingAssignment.destroy({ where: { id: aids } });
        }
        // Programs: drop the id from course_ids arrays + null the legacy column.
        const scrubbed = await scrubArrayColumn(Program, 'course_ids', cid);
        await Program.update({ course_id: null }, { where: { course_id: cid } });
        console.log(`[sweep] course ${cid}: cleared progress + ${aids.length} assignment(s), scrubbed ${scrubbed} program(s)`);
    } catch (e) {
        console.warn(`[sweep] course ${cid} cleanup failed (non-fatal):`, e.message);
    }
};

// Everything that references ONE batch (members are already wiped by
// BatchService.remove): program/course JSONB arrays + delegation rosters.
const scrubBatchRefs = async (batchId) => {
    const bid = Number(batchId);
    try {
        const [programs, courses, rosters] = await Promise.all([
            scrubArrayColumn(Program, 'batch_ids', bid),
            scrubArrayColumn(Course, 'batch_ids', bid),
            AssignmentMember.destroy({ where: { member_type: 'batch', member_ref: String(bid) } }),
        ]);
        if (programs + courses + rosters) {
            console.log(`[sweep] batch ${bid}: scrubbed ${programs} program(s), ${courses} course(s), ${rosters} roster row(s)`);
        }
    } catch (e) {
        console.warn(`[sweep] batch ${bid} cleanup failed (non-fatal):`, e.message);
    }
};

module.exports = { sweepStudentData, scrubCourseRefs, scrubBatchRefs };

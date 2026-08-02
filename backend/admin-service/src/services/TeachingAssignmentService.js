// Stub TeachingAssignmentService - Full implementation pending
// This file provides minimal stubs to allow the system to boot.
//
// "Delegation" in this codebase is modelled with BATCHES: a student who is an
// active member of a batch gets access to that batch's course. The two lookups
// below (coursesForStudent / studentsForCourse) are the batch-membership
// resolvers PublicCourseService relies on for the canonical "My Courses" list
// and the per-course class ranking. They are best-effort: any DB miss returns
// an empty list so the caller degrades to "enrolled-only" rather than 500ing.
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

module.exports = {
  ensureAssignmentsForCourse: async (courseId, teachers, clgId) => {
    // Stub: no-op for now
    return null;
  },

  studentsByTeacher: async (teacherId) => {
    // Stub: return empty array
    return [];
  },

  // THE student-facing gate: which lessons of `courseId` may `userId` see?
  //
  // Access is modelled with BATCHES. A student reaches a course by being an
  // ACTIVE member of a batch bound to that course; the batch's teacher then
  // releases lessons one at a time into batch_lesson_releases. A lesson is
  // visible only once it has been released to a batch the student belongs to.
  //
  // Returns { enforced, rosterScoped, lessonIds }:
  //   enforced    — apply release gating to this course at all. TRUE whenever
  //                 the course is taught through any batch, so an un-released
  //                 lesson stays locked. Also TRUE (with an empty lessonIds)
  //                 for a student with no batch, so a non-member sees nothing
  //                 rather than the whole course.
  //   rosterScoped— this student is on a roster for this course (drives the
  //                 "assigned" / Go-to-Course flag on the details page).
  //   lessonIds   — Set<number> of released-and-not-in-the-future lesson ids.
  //
  // Fails CLOSED: any DB error returns enforced:true with no visible lessons.
  // A gate that silently opens on error is the one bug this feature can't have.
  visibleLessonIdsForStudent: async (courseId, userId) => {
    const cid = Number(courseId);
    const uid = String(userId ?? '').trim();
    const denied = { enforced: true, rosterScoped: false, lessonIds: new Set() };
    if (!cid || Number.isNaN(cid)) return { enforced: false, rosterScoped: false, lessonIds: new Set() };

    try {
      // Is this course taught through batches at all? If no batch is bound to
      // it, there is no teacher to release lessons and gating does not apply
      // (self-serve / catalogue course) — leave it to the other access rules.
      const [{ n } = { n: 0 }] = await sequelize.query(
        `SELECT COUNT(*)::int AS n FROM batches WHERE course_id = :cid`,
        { replacements: { cid }, type: QueryTypes.SELECT }
      );
      if (!Number(n)) return { enforced: false, rosterScoped: false, lessonIds: new Set() };

      // Unauthenticated request on a batch-taught course → nothing visible.
      if (!uid) return denied;

      // Batches this student is an ACTIVE member of for this course. Members
      // are keyed by either the batch's batch_id or its unique_id, and the
      // student column has both legacy (student_id) and current (user_id)
      // spellings — match all of them so nobody is wrongly locked out.
      const batches = await sequelize.query(
        `SELECT DISTINCT b.unique_id
           FROM batch_members bm
           JOIN batches b
             ON b.batch_id = bm.batch_id OR b.unique_id = bm.batch_id
          WHERE b.course_id = :cid
            AND bm.status = 'active'
            AND (bm.user_id = :uid OR bm.student_id = :uid)`,
        { replacements: { cid, uid }, type: QueryTypes.SELECT }
      );
      const batchIds = batches.map((r) => r.unique_id).filter(Boolean);
      if (!batchIds.length) return denied;

      // Lessons released to any of those batches. released_at in the future =
      // scheduled drip, still hidden.
      const rows = await sequelize.query(
        `SELECT DISTINCT lesson_id
           FROM batch_lesson_releases
          WHERE batch_id IN (:batchIds)
            AND (released_at IS NULL OR released_at <= now())`,
        { replacements: { batchIds }, type: QueryTypes.SELECT }
      );
      const lessonIds = new Set(
        rows.map((r) => Number(r.lesson_id)).filter((x) => !Number.isNaN(x))
      );
      return { enforced: true, rosterScoped: true, lessonIds };
    } catch (e) {
      console.warn('[teaching] visibleLessonIdsForStudent failed:', e.message);
      return denied;
    }
  },

  // Course IDs a student can access through batch membership. Joins
  // batch_members → batches on the string batch key (batch_members.batch_id
  // matches batches.batch_id OR batches.unique_id) and returns the distinct,
  // non-null course_ids of the student's ACTIVE batches. Returns [] on any
  // failure so /my-courses still surfaces the enrolled (user_progress) courses.
  coursesForStudent: async (userId) => {
    const uid = String(userId ?? '').trim();
    if (!uid) return [];
    try {
      const rows = await sequelize.query(
        `SELECT DISTINCT b.course_id
           FROM batch_members bm
           JOIN batches b
             ON b.batch_id = bm.batch_id OR b.unique_id = bm.batch_id
          WHERE bm.user_id = :uid
            AND bm.status = 'active'
            AND b.course_id IS NOT NULL`,
        { replacements: { uid }, type: QueryTypes.SELECT }
      );
      return rows.map((r) => Number(r.course_id)).filter((n) => !Number.isNaN(n));
    } catch (e) {
      console.warn('[teaching] coursesForStudent failed:', e.message);
      return [];
    }
  },

  // Inverse of coursesForStudent: user IDs of the students who reach a course
  // through batch membership. Used to size a course's "class" for ranking.
  // Returns [] on any failure.
  studentsForCourse: async (courseId) => {
    const cid = Number(courseId);
    if (!cid || Number.isNaN(cid)) return [];
    try {
      const rows = await sequelize.query(
        `SELECT DISTINCT bm.user_id
           FROM batch_members bm
           JOIN batches b
             ON b.batch_id = bm.batch_id OR b.unique_id = bm.batch_id
          WHERE b.course_id = :cid
            AND bm.status = 'active'
            AND bm.user_id IS NOT NULL`,
        { replacements: { cid }, type: QueryTypes.SELECT }
      );
      return rows.map((r) => String(r.user_id));
    } catch (e) {
      console.warn('[teaching] studentsForCourse failed:', e.message);
      return [];
    }
  },
};

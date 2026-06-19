// Stub TeachingAssignmentService - Full implementation pending
// This file provides minimal stubs to allow the system to boot

module.exports = {
  ensureAssignmentsForCourse: async (courseId, teachers, clgId) => {
    // Stub: no-op for now
    return null;
  },

  studentsByTeacher: async (teacherId) => {
    // Stub: return empty array
    return [];
  },

  visibleLessonIdsForStudent: (releases, freeLessonIds) => {
    // Stub: return free lessons only
    return new Set(freeLessonIds || []);
  }
};

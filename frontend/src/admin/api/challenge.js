import api from './client';

// Challenge submissions — the teacher/admin review surface.
// Mounted at /api/admin behind adminOrTeacher; the server re-checks that the
// caller actually teaches the course, so a teacher cannot read another
// teacher's students by guessing a lesson id.

export const listChallengeSubmissions = (lessonId) =>
    api.get(`/challenges/${lessonId}/submissions`).then((r) => r.data);

// Save a mark out of 100. Any mark completes the class for that student.
export const markChallengeSubmission = (id, body) =>
    api.post(`/challenges/submissions/${id}/mark`, body).then((r) => r.data);

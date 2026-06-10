import api from './client';

// Admin reads over teacher-authored post-class student evaluations
// (admin-service :5000, /api/admin/feedback*).
export const feedbackStats = () => api.get('/feedback/stats').then((r) => r.data);
export const feedbackByStudent = () => api.get('/feedback/by-student').then((r) => r.data);
export const listFeedback = (params) => api.get('/feedback', { params }).then((r) => r.data);

// Student → teacher/class feedback (the inverse direction).
export const teacherFeedbackStats = () => api.get('/teacher-feedback/stats').then((r) => r.data);
export const teacherFeedbackByTeacher = () => api.get('/teacher-feedback/by-teacher').then((r) => r.data);
export const listTeacherFeedback = (params) => api.get('/teacher-feedback', { params }).then((r) => r.data);

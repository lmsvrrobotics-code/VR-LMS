import api from './client';
import { notifyScheduleChanged } from './scheduleEvents';

// Admin slots CRUD (admin-service :5000, /api/admin/slots*).
// JSON payloads — course_id, start_at, end_at, and teacher_ids/student_ids arrays.
export const listSlots = (params) => api.get('/slots', { params }).then((r) => r.data);
export const getSlot = (id) => api.get(`/slots/edit/${id}`).then((r) => r.data);
export const storeSlot = (body) => api.post('/slots/store', body).then((r) => { notifyScheduleChanged(); return r.data; });
export const updateSlot = (id, body) => api.post(`/slots/update/${id}`, body).then((r) => { notifyScheduleChanged(); return r.data; });
export const deleteSlot = (id) => api.delete(`/slots/delete/${id}`).then((r) => { notifyScheduleChanged(); return r.data; });
export const toggleSlotStatus = (id) => api.get(`/slots/status/${id}`).then((r) => { notifyScheduleChanged(); return r.data; });
// Students enrolled in a given course — for the course-driven student picker.
export const listCourseStudents = (courseId) =>
    api.get(`/slots/course-students/${courseId}`).then((r) => r.data);

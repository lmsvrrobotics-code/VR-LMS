import api from './client';
import { notifyScheduleChanged } from './scheduleEvents';

// Admin classes CRUD (admin-service :5000, /api/admin/classes*). JSON payloads.
export const listClasses = (params) => api.get('/classes', { params }).then((r) => r.data);
export const getClass = (id) => api.get(`/classes/edit/${id}`).then((r) => r.data);
export const storeClass = (body) => api.post('/classes/store', body).then((r) => { notifyScheduleChanged(); return r.data; });
export const updateClass = (id, body) => api.post(`/classes/update/${id}`, body).then((r) => { notifyScheduleChanged(); return r.data; });
export const deleteClass = (id) => api.delete(`/classes/delete/${id}`).then((r) => { notifyScheduleChanged(); return r.data; });
export const toggleClassStatus = (id) => api.get(`/classes/status/${id}`).then((r) => { notifyScheduleChanged(); return r.data; });

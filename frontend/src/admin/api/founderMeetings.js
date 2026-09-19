import api from './client';

// Admin "Weekly Meeting with Founder" CRUD (admin-service :5000,
// /api/admin/founder-meetings*). store/update send multipart/form-data because
// they carry two optional files: `video` (→ Bunny) and `poster` (→ R2).
export const listFounderMeetings = (params) =>
    api.get('/founder-meetings', { params }).then((r) => r.data);
export const getFounderMeeting = (id) =>
    api.get(`/founder-meetings/edit/${id}`).then((r) => r.data);
export const storeFounderMeeting = (fd) =>
    api.post('/founder-meetings/store', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const updateFounderMeeting = (id, fd) =>
    api.post(`/founder-meetings/update/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const deleteFounderMeeting = (id) =>
    api.delete(`/founder-meetings/delete/${id}`).then((r) => r.data);
export const toggleFounderMeetingStatus = (id) =>
    api.get(`/founder-meetings/status/${id}`).then((r) => r.data);

// Who registered for a meeting, and the attended/no-show workflow.
export const listMeetingRegistrations = (id, params) =>
    api.get(`/founder-meetings/${id}/registrations`, { params }).then((r) => r.data);
export const setRegistrationStatus = (id, status) =>
    api.post(`/founder-meetings/registrations/${id}/status`, { status }).then((r) => r.data);
export const deleteRegistration = (id) =>
    api.delete(`/founder-meetings/registrations/${id}`).then((r) => r.data);

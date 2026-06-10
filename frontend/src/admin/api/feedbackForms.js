import api from './client';

// Admin reads over teacher-authored dynamic feedback forms
// (admin-service :5000, /api/admin/feedback-forms*).
export const listForms = () => api.get('/feedback-forms').then((r) => r.data);
export const formStats = (id) => api.get(`/feedback-forms/${id}/stats`).then((r) => r.data);
export const formResponses = (id) => api.get(`/feedback-forms/${id}/responses`).then((r) => r.data);

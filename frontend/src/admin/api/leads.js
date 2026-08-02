import api from './client';

// Admin lead pipeline (admin-service /api/admin/leads). Public capture is on
// /api/public/leads and is called from the portal signup form, not here.
export const listLeads = (params) =>
    api.get('/leads', { params }).then((r) => r.data);

export const leadStats = () =>
    api.get('/leads/stats').then((r) => r.data);

// body: { status?, notes?, assigned_to? }
export const updateLead = (id, body) =>
    api.put(`/leads/${id}`, body).then((r) => r.data);

// Marks the lead converted so the student appears in Manage Students.
// body: { password?, collegeId? } — password is needed ONLY when the lead has no
// account yet (has_account === false). A self-signup already has a login, so the
// server just links it and body can be {}.
export const convertLead = (id, body) =>
    api.post(`/leads/${id}/convert`, body).then((r) => r.data);

export const deleteLead = (id) =>
    api.delete(`/leads/${id}`).then((r) => r.data);

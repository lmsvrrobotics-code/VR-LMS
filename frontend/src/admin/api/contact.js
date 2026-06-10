import api from './client';

// Admin inbox for public "Send us a Message" submissions
// (admin-service /api/admin/contact-messages). Public capture is on
// /api/public/contact, called from the Contact page.
export const listMessages = (params) => api.get('/contact-messages', { params }).then((r) => r.data);
export const updateMessage = (id, body) => api.patch(`/contact-messages/${id}`, body).then((r) => r.data);
export const deleteMessage = (id) => api.delete(`/contact-messages/${id}`).then((r) => r.data);

import api from './client';

// Admin kits CRUD (admin-service :5000, /api/admin/kits*).
// store/update send multipart/form-data because they may carry a cover image.
// Kits are sellable products with Razorpay payment links.
export const listKits = (params) => api.get('/kits', { params }).then((r) => r.data);
export const getKit = (id) => api.get(`/kits/edit/${id}`).then((r) => r.data);
export const storeKit = (fd) =>
    api.post('/kits/store', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const updateKit = (id, fd) =>
    api.post(`/kits/update/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const deleteKit = (id) => api.delete(`/kits/delete/${id}`).then((r) => r.data);
export const toggleKitStatus = (id) => api.get(`/kits/status/${id}`).then((r) => r.data);

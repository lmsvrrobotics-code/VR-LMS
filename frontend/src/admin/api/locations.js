import api from './client';

// Admin locations CRUD (admin-service :5000, /api/admin/locations*).
// JSON only — photo/map are URL fields, no file upload.
export const listLocations = (params) => api.get('/locations', { params }).then((r) => r.data);
export const getLocation = (id) => api.get(`/locations/edit/${id}`).then((r) => r.data);
export const storeLocation = (body) => api.post('/locations/store', body).then((r) => r.data);
export const updateLocation = (id, body) => api.post(`/locations/update/${id}`, body).then((r) => r.data);
export const deleteLocation = (id) => api.delete(`/locations/delete/${id}`).then((r) => r.data);
export const toggleLocationStatus = (id) => api.get(`/locations/status/${id}`).then((r) => r.data);

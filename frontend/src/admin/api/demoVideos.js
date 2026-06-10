import api from './client';

// Admin demo/marketing videos CRUD (admin-service :5000, /api/admin/demo-videos*).
// store/update send multipart/form-data because they carry a video/image file.
export const listDemoVideos = (params) => api.get('/demo-videos', { params }).then((r) => r.data);
export const getDemoVideo = (id) => api.get(`/demo-videos/edit/${id}`).then((r) => r.data);
export const storeDemoVideo = (fd) =>
    api.post('/demo-videos/store', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const updateDemoVideo = (id, fd) =>
    api.post(`/demo-videos/update/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const deleteDemoVideo = (id) => api.delete(`/demo-videos/delete/${id}`).then((r) => r.data);
export const toggleDemoVideoStatus = (id) => api.get(`/demo-videos/status/${id}`).then((r) => r.data);

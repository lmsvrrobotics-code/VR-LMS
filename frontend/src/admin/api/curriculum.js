import api from './client';

export const listCurriculum = (courseId) => api.get(`/course/${courseId}/curriculum`).then((r) => r.data);

const isFormData = (d) => typeof FormData !== 'undefined' && d instanceof FormData;
const lessonConfig = (d) => isFormData(d) ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined;

// Sessions (sections in the API/DB) carry a cover image, so these post
// FormData. The endpoint names stay `/section` — only the UI wording changed.
export const storeSection = (data) => api.post('/section', data, lessonConfig(data)).then((r) => r.data);
export const updateSection = (data) => api.post('/section/update', data, lessonConfig(data)).then((r) => r.data);
export const deleteSection = (id) => api.get(`/section/delete/${id}`).then((r) => r.data);
export const sortSections = (ids) => api.post('/section/sort', { itemJSON: ids }).then((r) => r.data);

export const storeLesson = (data) => api.post('/lesson', data, lessonConfig(data)).then((r) => r.data);
export const updateLesson = (data) => api.post('/lesson/edit', data, lessonConfig(data)).then((r) => r.data);
export const getLesson = (id) => api.get(`/lesson/${id}`).then((r) => r.data);
export const deleteLesson = (id) => api.get(`/lesson/delete/${id}`).then((r) => r.data);
export const sortLessons = (ids) => api.post('/lesson/sort', { itemJSON: ids }).then((r) => r.data);

// Direct-to-Bunny video upload: mint a presigned TUS ticket, then poll status.
export const createVideoUpload = (title) => api.post('/video/create-upload', { title }).then((r) => r.data);
export const getVideoStatus = (guid) => api.get(`/video/${guid}/status`).then((r) => r.data);

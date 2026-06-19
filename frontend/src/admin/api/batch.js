import api from './client';

// Batches live behind /api/admin/batches in admin-service. A school admin is
// scoped by their JWT college_id automatically. The ROOT/super admin has no
// college, so it targets one by passing `clgId` — sent as a ?clgId= query
// param on every call. College-admin callers simply omit clgId.
const cfg = (clgId) => (clgId ? { params: { clgId } } : {});

export const listBatches = (clgId) =>
    api.get('/batches', cfg(clgId)).then((r) => r.data);

export const getBatch = (id, clgId) =>
    api.get(`/batches/${id}`, cfg(clgId)).then((r) => r.data);

export const createBatch = (payload, clgId) =>
    api.post('/batches', payload, cfg(clgId)).then((r) => r.data);

export const updateBatch = (id, payload, clgId) =>
    api.put(`/batches/${id}`, payload, cfg(clgId)).then((r) => r.data);

export const deleteBatch = (id, clgId) =>
    api.delete(`/batches/${id}`, cfg(clgId)).then((r) => r.data);

// Add one-or-many students. Server is idempotent — re-adding existing
// members is a no-op (unique index dedupes).
export const addBatchMembers = (id, userIds, clgId) =>
    api.post(`/batches/${id}/members`, { userIds }, cfg(clgId)).then((r) => r.data);

export const removeBatchMember = (id, userId, clgId) =>
    api.delete(`/batches/${id}/members/${userId}`, cfg(clgId)).then((r) => r.data);

// Students of the target college that can be added to a batch.
export const listEligibleStudents = (clgId) =>
    api.get('/batches/eligible-students', cfg(clgId)).then((r) => r.data);

// Lookup-only: batches across the given college IDs. Powers the Batches
// dropdown on Add/Edit Course where the admin first picks colleges.
// Not gated by the JWT's college_id — root admin can call it too.
export const listBatchesByColleges = (clgIds) =>
    api
        .get('/batches/by-colleges', { params: { clgIds: (clgIds || []).join(',') } })
        .then((r) => r.data);

// Add course to batch
export const addBatchCourse = (id, courseId, clgId) =>
    api.post(`/batches/${id}/courses`, { courseId }, cfg(clgId)).then((r) => r.data);

// Remove course from batch
export const removeBatchCourse = (id, courseId, clgId) =>
    api.delete(`/batches/${id}/courses/${courseId}`, cfg(clgId)).then((r) => r.data);

// Add teacher to batch
export const addBatchTeacher = (id, teacherId, clgId) =>
    api.post(`/batches/${id}/teachers`, { teacherId }, cfg(clgId)).then((r) => r.data);

// Remove teacher from batch
export const removeBatchTeacher = (id, teacherId, clgId) =>
    api.delete(`/batches/${id}/teachers/${teacherId}`, cfg(clgId)).then((r) => r.data);

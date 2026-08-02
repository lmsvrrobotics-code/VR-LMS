import api from './client';

// Programs endpoint for admin service
const cfg = (clgId) => (clgId ? { params: { clgId } } : {});

export const listPrograms = (clgId) =>
    api.get('/programs', cfg(clgId)).then((r) => r.data);

export const getProgram = (id, clgId) =>
    api.get(`/programs/${id}`, cfg(clgId)).then((r) => r.data);

export const createProgram = (payload, clgId) =>
    api.post('/programs', payload, cfg(clgId)).then((r) => r.data);

export const updateProgram = (id, payload, clgId) =>
    api.put(`/programs/${id}`, payload, cfg(clgId)).then((r) => r.data);

export const deleteProgram = (id, clgId) =>
    api.delete(`/programs/${id}`, cfg(clgId)).then((r) => r.data);

// Lookup-only: programs for a specific college and batch combination.
// Powers the Programs dropdown on Add/Edit Student where the admin first picks college/batch.
export const listProgramsForCollegeBatch = (clgId, batchId) =>
    api
        .get('/programs/by-college-batch', {
            params: { clgId, batchId },
        })
        .then((r) => r.data);

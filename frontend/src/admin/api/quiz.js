import api from './client';

export const storeQuiz = (data) => api.post('/quiz', data).then((r) => r.data);
export const updateQuiz = (id, data) => api.post(`/quiz/${id}`, data).then((r) => r.data);
export const getQuiz = (id) => api.get(`/quiz/${id}`).then((r) => r.data);

// A question can carry an image and/or a video, so it posts multipart. Arrays
// (options / answer) are JSON-encoded because FormData has no array type — the
// backend parses them back. File fields are skipped when empty so an edit that
// doesn't touch the media leaves the stored file alone.
const questionFormData = (data) => {
    const fd = new FormData();
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        if (value instanceof File) { fd.append(key, value); continue; }
        fd.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
    return fd;
};

export const storeQuestion = (data) => api.post('/question', questionFormData(data)).then((r) => r.data);
export const updateQuestion = (id, data) => api.post(`/question/${id}`, questionFormData(data)).then((r) => r.data);
export const deleteQuestion = (id) => api.delete(`/question/${id}`).then((r) => r.data);
export const sortQuestions = (ids) => api.post('/question/sort', { itemJSON: ids }).then((r) => r.data);

export const quizParticipants = (quizId) => api.get(`/quiz/${quizId}/participants`).then((r) => r.data);
export const quizAttempts = (quizId, userId) => api.get(`/quiz/${quizId}/attempts/${userId}`).then((r) => r.data);
export const quizSubmission = (submissionId) => api.get(`/quiz-submission/${submissionId}`).then((r) => r.data);

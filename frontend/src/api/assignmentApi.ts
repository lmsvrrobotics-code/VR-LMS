import axios from 'axios';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

const assignmentApi = {
    // Create assignment
    createAssignment: (batchId, courseId, data) =>
        axios.post(\\/api/admin/assignments\, {
            batch_id: batchId,
            course_id: courseId,
            ...data,
        }),

    // Get assignments for batch
    getBatchAssignments: (batchId) =>
        axios.get(\\/api/admin/batches/\/assignments\),

    // Get student assignments
    getStudentAssignments: () =>
        axios.get(\\/api/public/my-assignments\),

    // Submit assignment
    submitAssignment: (assignmentId, data) =>
        axios.post(\\/api/public/assignments/\/submit\, data),

    // Get student submission for an assignment
    getStudentSubmission: (assignmentId) =>
        axios.get(\\/api/public/assignments/\/submission\),

    // Get all submissions for assignment (teacher)
    getAssignmentSubmissions: (assignmentId) =>
        axios.get(\\/api/admin/assignments/\/submissions\),

    // Grade submission (teacher)
    gradeSubmission: (submissionId, score, feedback) =>
        axios.patch(\\/api/admin/submissions/\/grade\, {
            score,
            feedback,
        }),
};

export default assignmentApi;

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function TeacherAssignments() {
    const [batches, setBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState('');
    const [assignments, setAssignments] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [gradingForm, setGradingForm] = useState({ score: '', feedback: '' });

    const [createForm, setCreateForm] = useState({
        title: '',
        description: '',
        instructions: '',
        due_date: '',
        max_score: 100,
    });

    useEffect(() => {
        fetchBatches();
    }, []);

    useEffect(() => {
        if (selectedBatch) {
            fetchAssignments();
        }
    }, [selectedBatch]);

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: \Bearer \\ };
            const response = await axios.get(\\/api/admin/batches\, { headers });
            setBatches(response.data?.batches || []);
            if (response.data?.batches?.length > 0) {
                setSelectedBatch(response.data.batches[0].batch_id);
            }
        } catch (error) {
            toast.error('Failed to load batches');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAssignments = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: \Bearer \\ };
            const response = await axios.get(
                \\/api/admin/batches/\/assignments\,
                { headers }
            );
            setAssignments(response.data?.assignments || []);
        } catch (error) {
            toast.error('Failed to load assignments');
            console.error(error);
        }
    };

    const fetchSubmissions = async (assignmentId) => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: \Bearer \\ };
            const response = await axios.get(
                \\/api/admin/assignments/\/submissions\,
                { headers }
            );
            setSubmissions(response.data?.submissions || []);
        } catch (error) {
            toast.error('Failed to load submissions');
            console.error(error);
        }
    };

    const handleCreateAssignment = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: \Bearer \\ };
            const teacherId = localStorage.getItem('userId');

            await axios.post(\\/api/admin/assignments\, {
                batch_id: selectedBatch,
                course_id: batches.find(b => b.batch_id === selectedBatch)?.course_id,
                teacher_id: teacherId,
                ...createForm,
                due_date: new Date(createForm.due_date),
            }, { headers });

            toast.success('Assignment created successfully');
            setCreateForm({ title: '', description: '', instructions: '', due_date: '', max_score: 100 });
            setShowCreateForm(false);
            fetchAssignments();
        } catch (error) {
            toast.error('Failed to create assignment');
            console.error(error);
        }
    };

    const handleGradeSubmission = async (e) => {
        e.preventDefault();
        if (!selectedSubmission) return;

        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: \Bearer \\ };

            await axios.patch(
                \\/api/admin/submissions/\/grade\,
                {
                    score: parseInt(gradingForm.score),
                    feedback: gradingForm.feedback,
                },
                { headers }
            );

            toast.success('Submission graded successfully');
            setSelectedSubmission(null);
            setGradingForm({ score: '', feedback: '' });
            fetchSubmissions(selectedSubmission.assignment_id);
        } catch (error) {
            toast.error('Failed to grade submission');
            console.error(error);
        }
    };

    return (
        <div className="teacher-assignments">
            <div className="assignments-header">
                <h2>Manage Assignments</h2>
                <button
                    className="btn-create"
                    onClick={() => setShowCreateForm(!showCreateForm)}
                >
                    <i className="fi-rr-plus" /> Create Assignment
                </button>
            </div>

            {/* Batch Selector */}
            <div className="batch-selector">
                <select
                    value={selectedBatch}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    className="batch-select"
                >
                    {batches.map((batch) => (
                        <option key={batch.batch_id} value={batch.batch_id}>
                            {batch.batch_id}
                        </option>
                    ))}
                </select>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <div className="create-form">
                    <h3>Create New Assignment</h3>
                    <form onSubmit={handleCreateAssignment}>
                        <div className="form-group">
                            <label>Title *</label>
                            <input
                                type="text"
                                value={createForm.title}
                                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea
                                value={createForm.description}
                                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                                rows={3}
                            />
                        </div>
                        <div className="form-group">
                            <label>Instructions</label>
                            <textarea
                                value={createForm.instructions}
                                onChange={(e) => setCreateForm({ ...createForm, instructions: e.target.value })}
                                rows={3}
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Due Date *</label>
                                <input
                                    type="datetime-local"
                                    value={createForm.due_date}
                                    onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Max Score</label>
                                <input
                                    type="number"
                                    value={createForm.max_score}
                                    onChange={(e) => setCreateForm({ ...createForm, max_score: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn-submit">Create Assignment</button>
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => setShowCreateForm(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Assignments List */}
            <div className="assignments-list">
                {assignments.length === 0 ? (
                    <div className="empty-state">
                        <p>No assignments created yet.</p>
                    </div>
                ) : (
                    assignments.map((assignment) => (
                        <div key={assignment.id} className="assignment-item">
                            <div className="assignment-info">
                                <h4>{assignment.title}</h4>
                                <p>Due: {new Date(assignment.due_date).toLocaleDateString()}</p>
                            </div>
                            <button
                                className="btn-view-submissions"
                                onClick={() => fetchSubmissions(assignment.id)}
                            >
                                View Submissions
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Submissions List */}
            {submissions.length > 0 && (
                <div className="submissions-section">
                    <h3>Student Submissions</h3>
                    <div className="submissions-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Submitted</th>
                                    <th>Status</th>
                                    <th>Score</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((submission) => (
                                    <tr key={submission.id} className={submission.status}>
                                        <td>{submission.student_id}</td>
                                        <td>{new Date(submission.submitted_date).toLocaleDateString()}</td>
                                        <td>
                                            <span className={\adge badge-\\}>
                                                {submission.status}
                                            </span>
                                        </td>
                                        <td>{submission.score ? \\/100\ : '-'}</td>
                                        <td>
                                            <button
                                                className="btn-grade"
                                                onClick={() => {
                                                    setSelectedSubmission(submission);
                                                    setGradingForm({ score: submission.score || '', feedback: submission.feedback || '' });
                                                }}
                                            >
                                                Grade
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Grading Modal */}
            {selectedSubmission && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Grade Submission</h3>
                        <p className="student-name">{selectedSubmission.student_id}</p>
                        
                        {selectedSubmission.submission_text && (
                            <div className="submission-text">
                                <h4>Student's Work</h4>
                                <p>{selectedSubmission.submission_text}</p>
                            </div>
                        )}

                        <form onSubmit={handleGradeSubmission}>
                            <div className="form-group">
                                <label>Score</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={gradingForm.score}
                                    onChange={(e) => setGradingForm({ ...gradingForm, score: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Feedback</label>
                                <textarea
                                    value={gradingForm.feedback}
                                    onChange={(e) => setGradingForm({ ...gradingForm, feedback: e.target.value })}
                                    rows={4}
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn-submit">Submit Grade</button>
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => setSelectedSubmission(null)}
                                >
                                    Close
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

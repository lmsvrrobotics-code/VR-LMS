import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './styles/AssignmentCard.css';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function AssignmentCard({ assignment, onUpdate }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionText, setSubmissionText] = useState('');
    const [submissionFile, setSubmissionFile] = useState(null);
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);

    const submission = assignment.AssignmentSubmissions?.[0];
    const isSubmitted = !!submission;
    const isGraded = submission?.status === 'graded';
    const isDueToday = new Date(assignment.due_date).toDateString() === new Date().toDateString();
    const isDuesoon = new Date(assignment.due_date) - Date.now() < 24 * 60 * 60 * 1000;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!submissionText && !submissionFile) {
            toast.error('Please add submission text or a file');
            return;
        }

        try {
            setIsSubmitting(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const userId = localStorage.getItem('userId');
            const studentId = localStorage.getItem('studentId');

            const response = await axios.post(
                `${API_BASE}/api/public/assignments/submit`,
                {
                    submission_text: submissionText,
                    student_id: studentId,
                },
                { headers }
            );

            toast.success('Assignment submitted successfully');
            setSubmissionText('');
            setSubmissionFile(null);
            setIsOpen(false);
            onUpdate?.();
        } catch (error) {
            toast.error('Failed to submit assignment');
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div className="assignment-card">
            <div className="assignment-header">
                <div className="assignment-title-section">
                    <h3 className="assignment-title">{assignment.title}</h3>
                    {isDueToday && <span className="badge-urgent">Due Today!</span>}
                    {isDueSoon && !isDueToday && <span className="badge-warning">Due Soon</span>}
                    {isGraded && <span className="badge-graded">Graded</span>}
                    {isSubmitted && !isGraded && <span className="badge-submitted">Submitted</span>}
                </div>
                <button
                    className="btn-toggle"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <i className="icon" />
                </button>
            </div>

            {isOpen && (
                <div className="assignment-details">
                    <div className="assignment-meta">
                        <div className="meta-item">
                            <span className="label">Due Date:</span>
                            <span className="value">{formatDate(assignment.due_date)}</span>
                        </div>
                        <div className="meta-item">
                            <span className="label">Max Score:</span>
                            <span className="value">{assignment.max_score} points</span>
                        </div>
                        {isGraded && (
                            <div className="meta-item">
                                <span className="label">Your Score:</span>
                                <span className="value score">{submission.score}/{assignment.max_score}</span>
                            </div>
                        )}
                    </div>

                    {assignment.description && (
                        <div className="assignment-description">
                            <h4>Description</h4>
                            <p>{assignment.description}</p>
                        </div>
                    )}

                    {assignment.instructions && (
                        <div className="assignment-instructions">
                            <h4>Instructions</h4>
                            <p>{assignment.instructions}</p>
                        </div>
                    )}

                    {isGraded && submission?.feedback && (
                        <div className="teacher-feedback">
                            <h4>Teacher Feedback</h4>
                            <p>{submission.feedback}</p>
                        </div>
                    )}

                    {!isSubmitted && (
                        <div className="submission-form">
                            <h4>Submit Your Work</h4>
                            <form onSubmit={handleSubmit}>
                                <textarea
                                    placeholder="Type your response here..."
                                    value={submissionText}
                                    onChange={(e) => setSubmissionText(e.target.value)}
                                    rows={4}
                                />
                                <input
                                    type="file"
                                    onChange={(e) => setSubmissionFile(e.target.files?.[0])}
                                />
                                <button type="submit" disabled={isSubmitting} className="btn-submit">
                                    {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
                                </button>
                            </form>
                        </div>
                    )}

                    {isSubmitted && (
                        <div className="submission-status">
                            <p>Submitted on {formatDate(submission.submitted_date)}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

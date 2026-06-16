import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import AssignmentCard from '../../components/AssignmentCard';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function Assignments() {
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, pending, submitted, graded

    useEffect(() => {
        fetchAssignments();
    }, []);

    const fetchAssignments = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: \Bearer \\ };
            const response = await axios.get(\\/api/public/my-assignments\, { headers });
            setAssignments(response.data?.assignments || []);
        } catch (error) {
            toast.error('Failed to load assignments');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const filterAssignments = () => {
        if (filter === 'all') return assignments;
        if (filter === 'pending') return assignments.filter(a => !a.AssignmentSubmissions?.length);
        if (filter === 'submitted') return assignments.filter(a => a.AssignmentSubmissions?.some(s => s.status === 'submitted'));
        if (filter === 'graded') return assignments.filter(a => a.AssignmentSubmissions?.some(s => s.status === 'graded'));
        return assignments;
    };

    const filtered = filterAssignments();

    if (loading) {
        return <div className="loading-spinner">Loading assignments...</div>;
    }

    return (
        <div className="tab-section">
            <div className="filter-bar">
                <button
                    className={\ilter-btn \\}
                    onClick={() => setFilter('all')}
                >
                    All ({assignments.length})
                </button>
                <button
                    className={\ilter-btn \\}
                    onClick={() => setFilter('pending')}
                >
                    Pending
                </button>
                <button
                    className={\ilter-btn \\}
                    onClick={() => setFilter('submitted')}
                >
                    Submitted
                </button>
                <button
                    className={\ilter-btn \\}
                    onClick={() => setFilter('graded')}
                >
                    Graded
                </button>
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state">
                    <i className="fi-rr-document" />
                    <p>No assignments to display.</p>
                </div>
            ) : (
                <div className="assignments-grid">
                    {filtered.map((assignment) => (
                        <AssignmentCard
                            key={assignment.id}
                            assignment={assignment}
                            onUpdate={fetchAssignments}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

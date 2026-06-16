import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import AssignmentCard from '../../components/AssignmentCard';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function Assignments() {
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchAssignments();
    }, []);

    const fetchAssignments = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            // Endpoint automatically filters by student's batches
            const response = await axios.get(`${API_BASE}/api/public/my-assignments`, { headers });
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
        if (filter === 'pending') return assignments.filter(a => !a.submissions?.length);
        if (filter === 'submitted') return assignments.filter(a => a.submissions?.some(s => s.status === 'submitted'));
        if (filter === 'graded') return assignments.filter(a => a.submissions?.some(s => s.status === 'graded'));
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
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All ({assignments.length})
                </button>
                <button
                    className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
                    onClick={() => setFilter('pending')}
                >
                    Pending
                </button>
                <button
                    className={`filter-btn ${filter === 'submitted' ? 'active' : ''}`}
                    onClick={() => setFilter('submitted')}
                >
                    Submitted
                </button>
                <button
                    className={`filter-btn ${filter === 'graded' ? 'active' : ''}`}
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

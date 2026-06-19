import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function MyCourses() {
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBatch, setSelectedBatch] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            const [batchesRes, coursesRes] = await Promise.all([
                axios.get(`${API_BASE}/api/public/batches/my`, { headers }),
                axios.get(`${API_BASE}/api/public/courses/my`, { headers }),
            ]);

            const batchesList = batchesRes.data?.batches || [];
            setBatches(batchesList);
            setCourses(coursesRes.data?.courses || []);

            if (batchesList.length > 0) {
                setSelectedBatch(batchesList[0].unique_id);
            }
        } catch (error) {
            toast.error('Failed to load courses');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading-spinner">Loading courses...</div>;
    }

    if (batches.length === 0) {
        return (
            <div className="empty-state">
                <i className="fi-rr-book" />
                <p>You are not enrolled in any batches yet.</p>
            </div>
        );
    }

    if (courses.length === 0) {
        return (
            <div className="empty-state">
                <i className="fi-rr-book" />
                <p>Your batch does not have any courses yet.</p>
            </div>
        );
    }

    return (
        <div className="tab-section">
            {batches.length > 1 && (
                <div className="batch-selector" style={{ marginBottom: '24px' }}>
                    <label style={{ marginRight: '12px', fontWeight: '600' }}>Select Batch:</label>
                    <select
                        value={selectedBatch || ''}
                        onChange={(e) => setSelectedBatch(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        {batches.map((batch) => (
                            <option key={batch.unique_id} value={batch.unique_id}>
                                {batch.display_name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="courses-grid">
                {courses.map((course) => (
                    <div 
                        key={course.id} 
                        className="course-card"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="course-image">
                            <img src={course.featured_image || '/placeholder.png'} alt={course.title} />
                        </div>
                        <div className="course-content">
                            <h3 className="course-title">{course.title}</h3>
                            <p className="course-description">{course.description}</p>
                            <div className="course-meta">
                                <span className="course-category">{course.Category?.name || 'General'}</span>
                                <span className="course-lessons">{course.Lessons?.length || 0} Lessons</span>
                            </div>
                            <a 
                                href={`/courses/${course.id}`} 
                                className="btn-view-course"
                                onClick={(e) => {
                                    e.preventDefault();
                                    navigate(`/courses/${course.id}`);
                                }}
                            >
                                Continue Learning
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

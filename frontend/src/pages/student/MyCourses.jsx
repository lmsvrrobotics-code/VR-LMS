import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function MyCourses() {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            // Fixed: Use /api/public/courses/my (student-filtered endpoint)
            const response = await axios.get(`${API_BASE}/api/public/courses/my`, { headers });
            setCourses(response.data?.courses || []);
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

    if (courses.length === 0) {
        return (
            <div className="empty-state">
                <i className="fi-rr-book" />
                <p>You haven't enrolled in any courses yet.</p>
            </div>
        );
    }

    return (
        <div className="tab-section">
            <div className="courses-grid">
                {courses.map((course) => (
                    <div key={course.id} className="course-card">
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
                            <a href={`/courses/${course.id}`} className="btn-view-course">
                                Continue Learning
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

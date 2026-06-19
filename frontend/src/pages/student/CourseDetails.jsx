import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import './CourseDetails.css';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function CourseDetails() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [batch, setBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        fetchData();
    }, [courseId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            // Fetch course details
            const courseRes = await axios.get(
                `${API_BASE}/api/public/courses/${courseId}`,
                { headers }
            );
            setCourse(courseRes.data?.course || courseRes.data);

            // Fetch batches to find which batch this course belongs to
            const batchesRes = await axios.get(
                `${API_BASE}/api/public/batches/my`,
                { headers }
            );
            const batches = batchesRes.data?.batches || [];
            if (batches.length > 0) {
                setBatch(batches[0]);
            }
        } catch (error) {
            toast.error('Failed to load course details');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading-spinner">Loading course details...</div>;
    }

    if (!course) {
        return (
            <div className="empty-state">
                <i className="fi-rr-book" />
                <p>Course not found.</p>
                <button onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    const progress = course.progress || 0;
    const score = course.score || 0;
    const maxScore = course.score_max || 100;
    const lessons = course.Lessons?.length || 0;
    const totalHours = course.total_hours || '0h 0m';
    const lecturesPerWeek = course.lectures_label || '2 Hours/Week';

    return (
        <div className="course-details-container">
            {/* Header */}
            <div className="details-header">
                <div className="header-left">
                    <button className="back-btn" onClick={() => navigate(-1)}>
                        <i className="fi-rr-arrow-left" />
                    </button>
                    <div className="header-info">
                        <h1 className="course-title">{course.title}</h1>
                        {batch && <p className="batch-name">Batch: {batch.display_name}</p>}
                    </div>
                </div>
                <div className="header-right">
                    <button className="btn-primary">Buy this course</button>
                </div>
            </div>

            {/* Main Content */}
            <div className="details-content">
                {/* Left Section */}
                <div className="left-section">
                    {/* Progress Bar */}
                    <div className="progress-section">
                        <div className="progress-label">
                            <span>Progress</span>
                            <span className="progress-percent">{progress}%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="tabs-navigation">
                        <button
                            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            Overview
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'curriculum' ? 'active' : ''}`}
                            onClick={() => setActiveTab('curriculum')}
                        >
                            Curriculum
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="tab-content">
                        {activeTab === 'overview' && (
                            <div className="overview-section">
                                <h3>Course Overview</h3>
                                <p>{course.description}</p>

                                {/* Course Info Grid */}
                                <div className="course-info-grid">
                                    <div className="info-card">
                                        <div className="info-icon">
                                            <i className="fi-rr-line-chart" />
                                        </div>
                                        <div className="info-content">
                                            <span className="info-label">Level</span>
                                            <span className="info-value">{course.level || 'Beginner'}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <div className="info-icon">
                                            <i className="fi-rr-folder-open" />
                                        </div>
                                        <div className="info-content">
                                            <span className="info-label">Sections</span>
                                            <span className="info-value">{course.sections || 1}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <div className="info-icon">
                                            <i className="fi-rr-document" />
                                        </div>
                                        <div className="info-content">
                                            <span className="info-label">Lessons</span>
                                            <span className="info-value">{lessons}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <div className="info-icon">
                                            <i className="fi-rr-clock" />
                                        </div>
                                        <div className="info-content">
                                            <span className="info-label">Total Hours</span>
                                            <span className="info-value">{totalHours}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <div className="info-icon">
                                            <i className="fi-rr-globe" />
                                        </div>
                                        <div className="info-content">
                                            <span className="info-label">Language</span>
                                            <span className="info-value">{course.language || 'English'}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <div className="info-icon">
                                            <i className="fi-rr-award" />
                                        </div>
                                        <div className="info-content">
                                            <span className="info-label">Certificate</span>
                                            <span className="info-value">{course.has_certificate ? 'Yes' : 'No'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'curriculum' && (
                            <div className="curriculum-section">
                                <h3>Course Curriculum</h3>
                                {course.Lessons && course.Lessons.length > 0 ? (
                                    <div className="lessons-list">
                                        {course.Lessons.map((lesson, idx) => (
                                            <div key={lesson.id || idx} className="lesson-item">
                                                <div className="lesson-icon">
                                                    <i className="fi-rr-video" />
                                                </div>
                                                <div className="lesson-content">
                                                    <h4>{lesson.title}</h4>
                                                    <p>{lesson.description || 'No description'}</p>
                                                </div>
                                                <div className="lesson-duration">
                                                    {lesson.duration || '—'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p>No lessons available yet.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Section - Stats */}
                <div className="right-section">
                    <div className="stats-card">
                        <div className="stat-item">
                            <div className="stat-icon">
                                <i className="fi-rr-calendar" />
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Duration</span>
                                <span className="stat-value">Lifetime</span>
                            </div>
                        </div>

                        <div className="stat-item">
                            <div className="stat-icon">
                                <i className="fi-rr-clock" />
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Total Hours</span>
                                <span className="stat-value">{totalHours}</span>
                            </div>
                        </div>

                        <div className="stat-item">
                            <div className="stat-icon">
                                <i className="fi-rr-target" />
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Score</span>
                                <span className="stat-value">{score} / {maxScore}</span>
                            </div>
                        </div>

                        <div className="stat-item">
                            <div className="stat-icon">
                                <i className="fi-rr-document" />
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Lectures</span>
                                <span className="stat-value">{lecturesPerWeek}</span>
                            </div>
                        </div>

                        <div className="stat-item">
                            <div className="stat-icon">
                                <i className="fi-rr-award" />
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Class Rank</span>
                                <span className="stat-value">—</span>
                            </div>
                        </div>
                    </div>

                    <button
                        className="btn-primary btn-full"
                        onClick={() => {
                            // Navigate to course player (first lesson or lesson 1)
                            const firstLessonId = course.Lessons?.[0]?.id || 1;
                            navigate(`/courses/play/${course.id}/${firstLessonId}`);
                        }}
                    >
                        Enter Full Screen
                    </button>
                </div>
            </div>
        </div>
    );
}

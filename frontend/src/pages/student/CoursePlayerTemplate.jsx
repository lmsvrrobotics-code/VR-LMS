import { useState } from 'react';
import './styles/CoursePlayer.css';

export default function CoursePlayerTemplate() {
    const [currentLesson, setCurrentLesson] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const lessons = [
        { id: 1, title: 'Lesson 1: Introduction', duration: '15 min', completed: true },
        { id: 2, title: 'Lesson 2: Getting Started', duration: '20 min', completed: false, current: true },
        { id: 3, title: 'Lesson 3: Basic Concepts', duration: '25 min', completed: false },
        { id: 4, title: 'Lesson 4: Advanced Topics', duration: '30 min', completed: false },
        { id: 5, title: 'Lesson 5: Final Project', duration: '45 min', completed: false },
    ];

    return (
        <div className="course-player-container">
            {/* Header */}
            <div className="player-header">
                <div className="header-left">
                    <button className="back-btn">← Back</button>
                    <h2>Arduino Basics</h2>
                </div>
                <div className="header-right">
                    <button className="fullscreen-btn">⛶ Fullscreen</button>
                    <button className="menu-btn">⋯</button>
                </div>
            </div>

            <div className="player-content">
                {/* Main Video Area */}
                <div className="main-video-area">
                    <div className="video-player">
                        <div className="video-placeholder">
                            <button className="play-btn">▶</button>
                            <p>Video Player</p>
                        </div>
                        <div className="video-controls">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: '35%' }}></div>
                            </div>
                            <div className="controls-row">
                                <div className="time">0:00 / 25:30</div>
                                <div className="control-buttons">
                                    <button className="control-btn">🔊</button>
                                    <button className="control-btn">⛶</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="player-sidebar">
                    <div className="sidebar-header">
                        <h3>Course Curriculum</h3>
                        <p>1/5 lessons</p>
                    </div>

                    {/* Lessons List */}
                    <div className="lessons-list">
                        {lessons.map((lesson, index) => (
                            <div
                                key={lesson.id}
                                className={`lesson-item ${lesson.completed ? 'completed' : ''} ${lesson.current ? 'current' : ''}`}
                                onClick={() => setCurrentLesson(index)}
                            >
                                <div className="lesson-number">
                                    {lesson.completed ? '✓' : lesson.current ? '▶' : index + 1}
                                </div>
                                <div className="lesson-content">
                                    <h4>{lesson.title}</h4>
                                    <p>{lesson.duration}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="sidebar-actions">
                        <button className="btn-complete">✓ Mark as Complete</button>
                        <button className="btn-next">Next Lesson →</button>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="player-footer">
                <button className="btn-previous">← Previous</button>
                <div className="progress-info">
                    <span>Lesson 2 of 5</span>
                    <div className="progress-dots">
                        {lessons.map((_, i) => (
                            <div
                                key={i}
                                className={`dot ${i <= currentLesson ? 'active' : ''}`}
                            ></div>
                        ))}
                    </div>
                </div>
                <button className="btn-next">Next →</button>
            </div>
        </div>
    );
}

import { useState } from 'react';
import MyClasses from './student/MyClasses';
import MyCourses from './student/MyCourses';
import Assignments from './student/Assignments';
import Profile from './student/Profile';
import NotificationBell from '../components/NotificationBell';
import '../styles/StudentDashboard.css';

export default function StudentDashboard() {
    const [activeTab, setActiveTab] = useState('classes');

    return (
        <div className="student-dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div className="header-left">
                    <h1>Student Dashboard</h1>
                </div>
                <div className="header-right">
                    <NotificationBell />
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="dashboard-tabs">
                <button
                    className={`tab-btn ${activeTab === 'classes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('classes')}
                >
                    <i className="fi-rr-monitor" /> My Classes
                </button>
                <button
                    className={`tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
                    onClick={() => setActiveTab('courses')}
                >
                    <i className="fi-rr-book" /> My Courses
                </button>
                <button
                    className={`tab-btn ${activeTab === 'assignments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('assignments')}
                >
                    <i className="fi-rr-document" /> Assignments
                </button>
                <button
                    className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
                    onClick={() => setActiveTab('profile')}
                >
                    <i className="fi-rr-user" /> Profile
                </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'classes' && <MyClasses />}
                {activeTab === 'courses' && <MyCourses />}
                {activeTab === 'assignments' && <Assignments />}
                {activeTab === 'profile' && <Profile />}
            </div>
        </div>
    );
}

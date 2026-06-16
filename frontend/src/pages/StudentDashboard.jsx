import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import MyClasses from './tabs/MyClasses';
import MyCourses from './tabs/MyCourses';
import Assignments from './tabs/Assignments';
import Profile from './tabs/Profile';
import NotificationBell from '../NotificationBell';
import '../styles/StudentDashboard.css';

export default function StudentDashboard() {
    const [activeTab, setActiveTab] = useState('classes');
    const [notificationCount, setNotificationCount] = useState(0);

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
                    className={\	ab-btn \\}
                    onClick={() => setActiveTab('classes')}
                >
                    <i className="fi-rr-monitor" /> My Classes
                </button>
                <button
                    className={\	ab-btn \\}
                    onClick={() => setActiveTab('courses')}
                >
                    <i className="fi-rr-book" /> My Courses
                </button>
                <button
                    className={\	ab-btn \\}
                    onClick={() => setActiveTab('assignments')}
                >
                    <i className="fi-rr-document" /> Assignments
                </button>
                <button
                    className={\	ab-btn \\}
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

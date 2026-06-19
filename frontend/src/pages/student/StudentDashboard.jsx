import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MyCourses from './MyCourses';
import './StudentDashboard.css';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('courses');

  const tabs = [
    { id: 'classes', label: 'My Classes', icon: '📚' },
    { id: 'courses', label: 'My Courses', icon: '🎓' },
    { id: 'assignments', label: 'Assignments', icon: '✏️' },
    { id: 'profile', label: 'Profile', icon: '👤' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'classes':
        return (
          <div className="empty-state">
            <p>📚 My Classes</p>
            <p>No classes assigned yet.</p>
          </div>
        );
      case 'courses':
        return <MyCourses />;
      case 'assignments':
        return (
          <div className="empty-state">
            <p>✏️ Assignments</p>
            <p>No assignments yet.</p>
          </div>
        );
      case 'profile':
        return (
          <div className="empty-state">
            <p>👤 Profile</p>
            <p>Profile page coming soon.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="student-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Student Dashboard</h1>
          <p>Batch-Based Learning System</p>
        </div>
        <button className="btn-logout" onClick={() => {
          localStorage.removeItem('token');
          navigate('/auth');
        }}>
          Logout
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="dashboard-content">
        {renderContent()}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import axios from 'axios';
import './styles/NotificationBell.css';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchNotifications = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const response = await axios.get(
                `${API_BASE}/api/public/notifications`,
                { headers }
            );
            const notifs = response.data?.rows || [];
            setNotifications(notifs);
            setUnreadCount(notifs.filter(n => !n.is_read).length);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    const markAsRead = async (notificationId) => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            await axios.patch(
                `${API_BASE}/api/public/notifications/${notificationId}/read`,
                {},
                { headers }
            );
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            await axios.patch(
                `${API_BASE}/api/public/notifications/mark-all-read`,
                {},
                { headers }
            );
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'class_created': return 'fi-rr-monitor';
            case 'course_added': return 'fi-rr-book';
            case 'assignment_given': return 'fi-rr-document';
            case 'feedback_form_enabled': return 'fi-rr-star';
            case 'assignment_graded': return 'fi-rr-check';
            default: return 'fi-rr-bell';
        }
    };

    return (
        <div className="notification-bell">
            <button
                className="bell-icon"
                onClick={() => setIsOpen(!isOpen)}
            >
                <i className="fi-rr-bell" />
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>

            {isOpen && (
                <div className="notification-panel">
                    <div className="panel-header">
                        <h3>Notifications</h3>
                        {unreadCount > 0 && (
                            <button className="mark-all-read" onClick={markAllAsRead}>
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="empty-notifications">
                                <p>No notifications</p>
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className="notification-item"
                                    onClick={() => !notif.is_read && markAsRead(notif.id)}
                                >
                                    <div className="notif-icon">
                                        <i className="fi-rr-bell" />
                                    </div>
                                    <div className="notif-content">
                                        <p className="notif-title">{notif.title}</p>
                                        <p className="notif-message">{notif.message}</p>
                                        <span className="notif-time">
                                            {new Date(notif.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

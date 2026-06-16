import axios from 'axios';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

const notificationApi = {
    // Get all notifications
    getNotifications: (limit = 50, offset = 0) =>
        axios.get(\\/api/public/notifications\, {
            params: { limit, offset },
        }),

    // Get unread notifications
    getUnreadNotifications: (limit = 10) =>
        axios.get(\\/api/public/notifications/unread\, {
            params: { limit },
        }),

    // Get unread count
    getUnreadCount: () =>
        axios.get(\\/api/public/notifications/count\),

    // Mark notification as read
    markAsRead: (notificationId) =>
        axios.patch(\\/api/public/notifications/\/read\),

    // Mark all as read
    markAllAsRead: () =>
        axios.patch(\\/api/public/notifications/mark-all-read\),

    // Delete notification
    deleteNotification: (notificationId) =>
        axios.delete(\\/api/public/notifications/\\),
};

export default notificationApi;

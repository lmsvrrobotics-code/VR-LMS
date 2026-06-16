const NotificationService = require('../services/NotificationService');

class NotificationController {
    // Get unread notifications
    async getUnreadNotifications(req, res) {
        try {
            const user_id = req.user?.id || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;

            if (!user_id) {
                return res.status(400).json({ error: 'user_id required' });
            }

            const notifications = await NotificationService.getUnreadNotifications(user_id, limit);
            res.json({ success: true, notifications });
        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get all notifications
    async getNotifications(req, res) {
        try {
            const user_id = req.user?.id || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            if (!user_id) {
                return res.status(400).json({ error: 'user_id required' });
            }

            const result = await NotificationService.getNotifications(user_id, limit, offset);
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Mark notification as read
    async markAsRead(req, res) {
        try {
            const { notification_id } = req.params;
            await NotificationService.markAsRead(notification_id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking notification:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Mark all as read
    async markAllAsRead(req, res) {
        try {
            const user_id = req.user?.id || req.headers['x-user-id'];
            if (!user_id) {
                return res.status(400).json({ error: 'user_id required' });
            }
            await NotificationService.markAllAsRead(user_id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking notifications:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get unread count
    async getUnreadCount(req, res) {
        try {
            const user_id = req.user?.id || req.headers['x-user-id'];
            if (!user_id) {
                return res.status(400).json({ error: 'user_id required' });
            }
            const count = await NotificationService.getUnreadCount(user_id);
            res.json({ success: true, count });
        } catch (error) {
            console.error('Error getting unread count:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Delete notification
    async deleteNotification(req, res) {
        try {
            const { notification_id } = req.params;
            await NotificationService.deleteNotification(notification_id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting notification:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new NotificationController();

const { Notification } = require('../models');
const { Op } = require('sequelize');

class NotificationService {
    // Create notification
    async createNotification(userId, type, title, message, relatedId = null) {
        return Notification.create({
            user_id: userId,
            type,
            title,
            message,
            related_id: relatedId,
        });
    }

    // Get unread notifications for user
    async getUnreadNotifications(userId, limit = 10) {
        return Notification.findAll({
            where: { user_id: userId, is_read: false },
            order: [['created_at', 'DESC']],
            limit,
        });
    }

    // Get all notifications for user
    async getNotifications(userId, limit = 50, offset = 0) {
        return Notification.findAndCountAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit,
            offset,
        });
    }

    // Mark notification as read
    async markAsRead(notificationId) {
        return Notification.update(
            { is_read: true, read_date: new Date() },
            { where: { id: notificationId } }
        );
    }

    // Mark all notifications as read
    async markAllAsRead(userId) {
        return Notification.update(
            { is_read: true, read_date: new Date() },
            { where: { user_id: userId, is_read: false } }
        );
    }

    // Delete notification
    async deleteNotification(notificationId) {
        return Notification.destroy({ where: { id: notificationId } });
    }

    // Get unread count for user
    async getUnreadCount(userId) {
        return Notification.count({
            where: { user_id: userId, is_read: false }
        });
    }

    // Broadcast notification to multiple users
    async broadcastNotification(userIds, type, title, message, relatedId = null) {
        const notifications = userIds.map(userId => ({
            user_id: userId,
            type,
            title,
            message,
            related_id: relatedId,
        }));
        return Notification.bulkCreate(notifications);
    }
}

module.exports = new NotificationService();

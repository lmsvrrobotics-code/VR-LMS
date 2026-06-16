const router = require('express').Router();
const ctrl = require('../controllers/NotificationController');

// Get unread notifications
router.get('/notifications/unread', ctrl.getUnreadNotifications);

// Get all notifications
router.get('/notifications', ctrl.getNotifications);

// Get unread count
router.get('/notifications/count', ctrl.getUnreadCount);

// Mark notification as read
router.patch('/notifications/:notification_id/read', ctrl.markAsRead);

// Mark all as read
router.patch('/notifications/mark-all-read', ctrl.markAllAsRead);

// Delete notification
router.delete('/notifications/:notification_id', ctrl.deleteNotification);

module.exports = router;

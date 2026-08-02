const joi = require('joi');
const router = require('express').Router();
const ctrl = require('../controllers/NotificationController');
const { validateParams, schemas } = require('../lib/validators');

// Get unread notifications
router.get('/notifications/unread', ctrl.getUnreadNotifications);

// Get all notifications
router.get('/notifications', ctrl.getNotifications);

// Get unread count
router.get('/notifications/count', ctrl.getUnreadCount);

// Mark notification as read
router.patch('/notifications/:notification_id/read', validateParams(joi.object({ notification_id: schemas.idParam.extract('id') })), ctrl.markAsRead);

// Mark all as read
router.patch('/notifications/mark-all-read', ctrl.markAllAsRead);

// Delete notification
router.delete('/notifications/:notification_id', validateParams(joi.object({ notification_id: schemas.idParam.extract('id') })), ctrl.deleteNotification);

module.exports = router;

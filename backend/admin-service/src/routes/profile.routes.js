const router = require('express').Router();
const ctrl = require('../controllers/ProfileController');

// Get profile
router.get('/profile', ctrl.getProfile);

// Update profile
router.patch('/profile', ctrl.updateProfile);

module.exports = router;

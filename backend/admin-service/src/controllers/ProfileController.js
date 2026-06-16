const { User } = require('../models');

class ProfileController {
    // Get logged-in user's profile
    async getProfile(req, res) {
        try {
            const user_id = req.authUser?.userId;
            if (!user_id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const user = await User.findByPk(user_id, {
                attributes: ['id', 'name', 'email', 'phone', 'avatar', 'clg_id']
            });

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ success: true, user });
        } catch (error) {
            console.error('Error fetching profile:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Update logged-in user's profile
    async updateProfile(req, res) {
        try {
            const user_id = req.authUser?.userId;
            if (!user_id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const { name, phone, avatar, clg_id } = req.body;

            const user = await User.findByPk(user_id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Only allow updating specific fields
            if (name) user.name = name;
            if (phone !== undefined) user.phone = phone;
            if (avatar) user.avatar = avatar;
            if (clg_id) user.clg_id = clg_id;

            await user.save();

            res.json({ success: true, user });
        } catch (error) {
            console.error('Error updating profile:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ProfileController();

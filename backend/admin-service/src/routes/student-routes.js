const router = require('express').Router();
const { BatchMember, Batch, Course } = require('../models');

// Get student's batches (filtered by authenticated user)
router.get('/batches/my', async (req, res) => {
    try {
        const user_id = req.authUser?.userId;
        if (!user_id) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const members = await BatchMember.findAll({
            where: { user_id, status: 'active' },
            include: [{
                model: Batch,
                as: 'batch',
                include: [{ model: Course, as: 'course' }],
            }],
        });

        const batches = members.map(m => ({ ...m.batch.dataValues, student_id: m.student_id }));
        res.json({ success: true, batches });
    } catch (error) {
        console.error('Error fetching student batches:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get student's courses (from enrolled batches)
router.get('/courses/my', async (req, res) => {
    try {
        const user_id = req.authUser?.userId;
        if (!user_id) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const members = await BatchMember.findAll({
            where: { user_id, status: 'active' }
        });

        if (members.length === 0) {
            return res.json({ success: true, courses: [] });
        }

        const batchIds = members.map(m => m.batch_id);

        const batches = await Batch.findAll({
            where: { batch_id: { [require('sequelize').Op.in]: batchIds } },
            include: [{ model: Course, as: 'course' }],
        });

        // Remove duplicates by course_id
        const courseMap = new Map();
        batches.forEach(batch => {
            if (batch.course && !courseMap.has(batch.course.id)) {
                courseMap.set(batch.course.id, batch.course);
            }
        });

        const courses = Array.from(courseMap.values());
        res.json({ success: true, courses });
    } catch (error) {
        console.error('Error fetching student courses:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

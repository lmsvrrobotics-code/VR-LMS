const router = require('express').Router();
const { BatchMember, Batch, Course } = require('../models');
const { Op } = require('sequelize');

// Get student's batches (1 course + 1 teacher + many students)
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
                include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }],
                attributes: ['unique_id', 'display_name', 'primary_teacher_id', 'course_id', 'status', 'created_at']
            }],
            raw: false
        });

        const batches = members.map(m => ({
            unique_id: m.batch.unique_id,
            display_name: m.batch.display_name,
            primary_teacher_id: m.batch.primary_teacher_id,
            course_id: m.batch.course_id,
            course: m.batch.course,
            status: m.batch.status,
            student_id: m.student_id,
            created_at: m.batch.created_at
        }));

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

        // Find all batches this student is in
        const members = await BatchMember.findAll({
            where: { user_id, status: 'active' },
            include: [{
                model: Batch,
                as: 'batch',
                attributes: ['course_id'],
                required: true
            }],
            raw: false
        });

        if (members.length === 0) {
            return res.json({ success: true, courses: [] });
        }

        // Get unique course IDs from all batches
        const courseIds = [...new Set(members.map(m => m.batch.course_id))];

        // Fetch course details
        const courses = await Course.findAll({
            where: { id: { [Op.in]: courseIds } },
            attributes: ['id', 'title', 'description', 'featured_image', 'score_max', 'lectures_label'],
            raw: true
        });

        res.json({ success: true, courses });
    } catch (error) {
        console.error('Error fetching student courses:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single course details
router.get('/courses/:courseId', async (req, res) => {
    try {
        const user_id = req.authUser?.userId;
        if (!user_id) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { courseId } = req.params;

        // Verify student has access to this course (it's in one of their batches)
        const hasAccess = await Batch.findOne({
            where: { course_id: courseId },
            include: [{
                model: BatchMember,
                where: { user_id, status: 'active' },
                required: true
            }]
        });

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied to this course' });
        }

        // Fetch course details
        const course = await Course.findByPk(courseId, {
            attributes: [
                'id', 'title', 'description', 'featured_image',
                'level', 'score_max', 'lectures_label', 'total_hours'
            ]
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json({ success: true, course: course.toJSON() });
    } catch (error) {
        console.error('Error fetching course details:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

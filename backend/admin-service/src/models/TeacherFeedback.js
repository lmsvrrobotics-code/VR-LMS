const { DataTypes } = require('sequelize');

// Student → teacher/class feedback submitted after a class. The inverse of
// StudentRecord kind='evaluation' (which is teacher → student). One row per
// submission. `ratings` holds the five 1-5 scores; the two free-text answers
// are stored separately. teacher_id is resolved from the course at submit time.
module.exports = (sequelize) => {
    const TeacherFeedback = sequelize.define('TeacherFeedback', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        student_id: { type: DataTypes.STRING(64), allowNull: false },
        course_id: { type: DataTypes.STRING(64), allowNull: true },
        teacher_id: { type: DataTypes.STRING(64), allowNull: true },
        // { explanation, engagement, understanding, activities, experience } 1-5
        ratings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        // "What did you enjoy most about today's class?"
        enjoyed: { type: DataTypes.TEXT, allowNull: true },
        // "Any suggestions for improvement?"
        suggestions: { type: DataTypes.TEXT, allowNull: true },
    }, { tableName: 'teacher_feedback', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    return TeacherFeedback;
};

const { DataTypes } = require('sequelize');

// A teacher-authored dynamic feedback form. The teacher builds the questions
// (star ratings / free text / multiple choice / yes-no), then ENABLES it — at
// which point it's pushed to the teacher's currently-assigned roster students
// (snapshotted into `audience_student_ids`). Each student fills it exactly once
// (enforced by the unique index on feedback_responses). Admin reads aggregates.
module.exports = (sequelize) => {
    const FeedbackForm = sequelize.define('FeedbackForm', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        teacher_id: { type: DataTypes.STRING(64), allowNull: false },
        title: { type: DataTypes.STRING(255), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        // Optional course this form relates to (free-text or numeric id).
        course_id: { type: DataTypes.STRING(64), allowNull: true },
        // [{ id, type: 'rating'|'text'|'mcq'|'yesno', label, options?: string[] }]
        questions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
        enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        enabled_at: { type: DataTypes.DATE, allowNull: true },
        // Snapshot of recipient student userIds, captured when the form is enabled.
        audience_student_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    }, { tableName: 'feedback_forms', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    return FeedbackForm;
};

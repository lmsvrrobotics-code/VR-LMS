const { DataTypes } = require('sequelize');

// One student's submission to a FeedbackForm. The unique (form_id, student_id)
// index makes the form a ONE-TIME submission: a student can answer each form
// exactly once. teacher_id is denormalized from the form so admin can filter
// responses by teacher without a join.
module.exports = (sequelize) => {
    const FeedbackResponse = sequelize.define('FeedbackResponse', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        form_id: { type: DataTypes.INTEGER, allowNull: false },
        student_id: { type: DataTypes.STRING(64), allowNull: false },
        teacher_id: { type: DataTypes.STRING(64), allowNull: true },
        // { [questionId]: number (rating) | string (text/mcq) | boolean (yesno) }
        answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    }, {
        tableName: 'feedback_responses',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [{ unique: true, fields: ['form_id', 'student_id'], name: 'feedback_responses_form_student_uniq' }],
    });

    return FeedbackResponse;
};

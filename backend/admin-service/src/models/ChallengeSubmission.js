const { DataTypes } = require('sequelize');

/**
 * A student's answer to a CHALLENGE lesson (lessons.lesson_type = 'challenge').
 *
 * The challenge itself is an ordinary `lessons` row — the external URL lives in
 * lesson_src and the brief in description — so only the submissions need their
 * own table. See migration 27.
 *
 * There is at most ONE row per (lesson, student): a resubmission updates the
 * existing row back to 'submitted' rather than stacking attempts, so a teacher
 * reviewing the queue always sees the current state and never has to work out
 * which of several rows is live.
 */
module.exports = (sequelize) => {
    const ChallengeSubmission = sequelize.define('ChallengeSubmission', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        lesson_id: { type: DataTypes.INTEGER, allowNull: false },
        course_id: { type: DataTypes.INTEGER },
        // auth-service users.userId — an 11-digit string, not an int.
        user_id: { type: DataTypes.STRING(255), allowNull: false },
        submission_url: { type: DataTypes.TEXT, allowNull: false },
        submission_note: { type: DataTypes.TEXT },
        // 'submitted' = awaiting a mark, 'approved' = marked. ('needs_work' is
        // still permitted by the DB CHECK so pre-migration-28 rows stay valid,
        // but nothing writes it any more.)
        status: { type: DataTypes.STRING(20), defaultValue: 'submitted' },
        // Out of 100. NULL means "not marked yet" — 0 would be ambiguous,
        // since zero is also a legitimate mark.
        score: { type: DataTypes.INTEGER },
        feedback: { type: DataTypes.TEXT },
        reviewed_by: { type: DataTypes.STRING(255) },
        reviewed_at: { type: DataTypes.DATE },
        submitted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    }, {
        tableName: 'challenge_submissions',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    ChallengeSubmission.associate = (models) => {
        ChallengeSubmission.belongsTo(models.Lesson, { foreignKey: 'lesson_id' });
    };

    return ChallengeSubmission;
};

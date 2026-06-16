module.exports = (sequelize, DataTypes) => {
    const AssignmentSubmission = sequelize.define('AssignmentSubmission', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        assignment_id: { type: DataTypes.INTEGER, allowNull: false },
        student_id: { type: DataTypes.STRING, allowNull: false },
        user_id: { type: DataTypes.STRING, allowNull: false },
        submission_text: { type: DataTypes.TEXT },
        file_url: { type: DataTypes.STRING },
        status: { type: DataTypes.ENUM('submitted', 'graded', 'not_submitted'), defaultValue: 'submitted' },
        submitted_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        score: { type: DataTypes.INTEGER },
        feedback: { type: DataTypes.TEXT },
        graded_date: { type: DataTypes.DATE },
        graded_by: { type: DataTypes.STRING },
        is_late: { type: DataTypes.BOOLEAN, defaultValue: false },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    });

    AssignmentSubmission.associate = (models) => {
        AssignmentSubmission.belongsTo(models.Assignment, { foreignKey: 'assignment_id' });
    };

    return AssignmentSubmission;
};

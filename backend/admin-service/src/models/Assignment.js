const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Assignment = sequelize.define('Assignment', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        batch_id: { type: DataTypes.STRING, allowNull: false },
        course_id: { type: DataTypes.INTEGER, allowNull: false },
        teacher_id: { type: DataTypes.STRING, allowNull: false },
        title: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.TEXT },
        instructions: { type: DataTypes.TEXT },
        due_date: { type: DataTypes.DATE, allowNull: false },
        max_score: { type: DataTypes.INTEGER, defaultValue: 100 },
        file_url: { type: DataTypes.STRING },
        status: { type: DataTypes.ENUM('draft', 'published', 'closed'), defaultValue: 'published' },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    }, {
        tableName: 'assignments',
        timestamps: false
    });

    Assignment.associate = (models) => {
        // batch_id is VARCHAR pointing to Batch.batch_id (unique string ID, not PK)
        // This requires targetKey to specify the alternate column
        Assignment.belongsTo(models.Batch, {
            foreignKey: 'batch_id',
            targetKey: 'batch_id',
            as: 'batch'
        });
        Assignment.belongsTo(models.Course, {
            foreignKey: 'course_id',
            as: 'course'
        });
        Assignment.hasMany(models.AssignmentSubmission, {
            foreignKey: 'assignment_id',
            as: 'submissions',
            onDelete: 'CASCADE'
        });
    };

    return Assignment;
};

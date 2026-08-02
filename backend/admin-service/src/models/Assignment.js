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
        // Ordered list of { kind: 'file'|'link', url, name, mime }. Replaces
        // the single file_url, which couldn't hold "PDF + image + link".
        attachments: { type: DataTypes.JSONB, allowNull: true },
        // Heading for the attachments block ("Reference material", "Read first"…).
        attachments_title: { type: DataTypes.STRING(200), allowNull: true },
        status: { type: DataTypes.ENUM('draft', 'published', 'closed'), defaultValue: 'published' },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    }, {
        tableName: 'assignments',
        timestamps: false
    });

    Assignment.associate = (models) => {
        // batch_id is VARCHAR pointing to Batch.unique_id (primary key)
        // Batch model temporarily disabled - will be re-enabled when batch tables are created
        if (models.Batch) {
            Assignment.belongsTo(models.Batch, {
                foreignKey: 'batch_id',
                targetKey: 'unique_id',
                as: 'batch'
            });
        }
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

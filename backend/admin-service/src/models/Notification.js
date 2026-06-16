module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define('Notification', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.STRING, allowNull: false },
        type: { type: DataTypes.ENUM('class_created', 'course_added', 'assignment_given', 'feedback_form_enabled', 'assignment_graded', 'feedback_submitted'), allowNull: false },
        title: { type: DataTypes.STRING, allowNull: false },
        message: { type: DataTypes.TEXT },
        related_id: { type: DataTypes.STRING }, // batch_id, course_id, assignment_id, etc.
        is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
        read_date: { type: DataTypes.DATE },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    }, {
        indexes: [
            { fields: ['user_id', 'is_read'] },
            { fields: ['created_at'] }
        ]
    });

    return Notification;
};

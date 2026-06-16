const { DataTypes } = require('sequelize');

// Student enrollment in a slot. When a student enrolls, the slot's enrolled_count increases.
// Status tracks: enrolled, attended, no-show, cancelled
module.exports = (sequelize) => {
    const SlotEnrollment = sequelize.define('SlotEnrollment', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        slot_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.STRING(64), allowNull: false },
        // Student unique ID (e.g., John_160625_001)
        student_id: { type: DataTypes.STRING(128), allowNull: true },
        // Enrollment status: enrolled, attended, no-show, cancelled
        status: { type: DataTypes.ENUM('enrolled', 'attended', 'no-show', 'cancelled'), defaultValue: 'enrolled' },
        // When student enrolled
        enrolled_date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        // When/if student attended
        attended_date: { type: DataTypes.DATE, allowNull: true },
    }, {
        tableName: 'slot_enrollments',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['slot_id'] },
            { fields: ['user_id'] },
            { fields: ['status'] },
            { unique: true, fields: ['slot_id', 'user_id'] },
        ],
    });

    SlotEnrollment.associate = (models) => {
        SlotEnrollment.belongsTo(models.Slot, { foreignKey: 'slot_id', as: 'slot' });
    };

    return SlotEnrollment;
};

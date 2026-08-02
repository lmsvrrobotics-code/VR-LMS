const { DataTypes } = require('sequelize');

// Time slot for a batch/course. Admin creates slots, students enroll.
// Each slot represents a specific time window (e.g., 08:30 AM - 09:30 AM on 2025-06-16)
module.exports = (sequelize) => {
    const Slot = sequelize.define('Slot', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        batch_id: { type: DataTypes.INTEGER, allowNull: false },
        course_id: { type: DataTypes.INTEGER, allowNull: false },
        // Slot date (YYYY-MM-DD)
        slot_date: { type: DataTypes.DATEONLY, allowNull: false },
        // Start time (HH:MM format, e.g., "08:30")
        start_time: { type: DataTypes.STRING(5), allowNull: false },
        // End time (HH:MM format, e.g., "09:30")
        end_time: { type: DataTypes.STRING(5), allowNull: false },
        // Maximum students that can enroll
        capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
        // Number currently enrolled
        enrolled_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // Status: available, full, cancelled
        status: { type: DataTypes.ENUM('available', 'full', 'cancelled'), defaultValue: 'available' },
        // Meeting link if online
        meeting_link: { type: DataTypes.TEXT, allowNull: true },
        // Topic/description
        topic: { type: DataTypes.STRING(255), allowNull: true },
        // Notes
        notes: { type: DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'slots',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['batch_id'] },
            { fields: ['course_id'] },
            { fields: ['slot_date'] },
            { fields: ['status'] },
        ],
    });

    Slot.associate = (models) => {
        // NOTE: no Batch association. The `batches` table is keyed by a varchar
        // `unique_id` (no integer `id`), so a belongsTo on slots.batch_id (INTEGER)
        // produces an `integer = character varying` join error. batch_id is kept as
        // a plain column; callers filter/return it directly.
        Slot.belongsTo(models.Course, { foreignKey: 'course_id', as: 'course' });
        Slot.hasMany(models.SlotEnrollment, { foreignKey: 'slot_id', as: 'enrollments' });
    };

    return Slot;
};

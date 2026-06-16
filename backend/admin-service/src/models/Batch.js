const { DataTypes } = require('sequelize');

// A Batch is a cohort of students assigned to one course with one teacher.
// Batch ID format: CourseName_DDMMYY_Count (e.g., Scratch_160625_01)
// Members are tracked in batch_members table. Teachers can be temporary
// (for individual classes when primary teacher is absent).
module.exports = (sequelize) => {
    const Batch = sequelize.define('Batch', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        // Unique batch identifier: CourseName_DDMMYY_Count (e.g., Scratch_160625_01)
        batch_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        course_id: { type: DataTypes.INTEGER, allowNull: false },
        teacher_id: { type: DataTypes.STRING(64), allowNull: false },
        // College/school association (optional, for multi-org support)
        clg_id: { type: DataTypes.STRING(64), allowNull: true },
        // Free-form description (e.g., "Section A - Advanced Scratch")
        description: { type: DataTypes.STRING(500) },
        start_date: { type: DataTypes.DATEONLY, allowNull: true },
        end_date: { type: DataTypes.DATEONLY, allowNull: true },
        is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    }, {
        tableName: 'batches',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['batch_id'] },
            { fields: ['course_id'] },
            { fields: ['teacher_id'] },
            { fields: ['clg_id'] },
        ],
    });

    Batch.associate = (models) => {
        Batch.belongsTo(models.Course, { foreignKey: 'course_id', as: 'course' });
        Batch.hasMany(models.BatchMember, { foreignKey: 'batch_id', as: 'members' });
    };

    return Batch;
};

const { DataTypes } = require('sequelize');

// Link table joining a Batch to a student. Tracks membership with joined/removed dates.
// A student can be in multiple batches. When admin removes a student, we set removed_date
// but keep the record (for long-term data preservation and analytics).
// Student unique ID format: Name_JoiningDate_SerialNumber (e.g., John_160625_001)
module.exports = (sequelize) => {
    const BatchMember = sequelize.define('BatchMember', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        batch_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.STRING(64), allowNull: false },
        // Unique student ID: Name_JoiningDate_SerialNumber (e.g., John_160625_001)
        student_id: { type: DataTypes.STRING(128), allowNull: false, unique: true },
        // When student joined this batch
        joined_date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
        // When student was removed (NULL = still active in batch)
        removed_date: { type: DataTypes.DATEONLY, allowNull: true },
        // Status: active or removed (for quick filtering)
        status: { type: DataTypes.ENUM('active', 'removed'), defaultValue: 'active' },
    }, {
        tableName: 'batch_members',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['batch_id'] },
            { fields: ['user_id'] },
            { fields: ['student_id'] },
            { fields: ['status'] },
        ],
    });

    BatchMember.associate = (models) => {
        BatchMember.belongsTo(models.Batch, { foreignKey: 'batch_id', as: 'batch' });
    };

    return BatchMember;
};

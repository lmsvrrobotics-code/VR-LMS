const { DataTypes } = require('sequelize');

// A class session for a batch. Tracks the primary teacher and optional temporary teacher.
// When primary teacher is absent, admin can assign a temporary teacher for that specific class.
module.exports = (sequelize) => {
    const BatchClass = sequelize.define('BatchClass', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        batch_id: { type: DataTypes.INTEGER, allowNull: false },
        // Class date and time
        class_date: { type: DataTypes.DATE, allowNull: false },
        // Primary teacher for this batch (from batches.teacher_id)
        teacher_id: { type: DataTypes.STRING(64), allowNull: false },
        // Temporary teacher for this specific class (if primary is absent)
        temp_teacher_id: { type: DataTypes.STRING(64), allowNull: true },
        // Topic/subject for the class
        topic: { type: DataTypes.STRING(255), allowNull: true },
        // Class notes or description
        notes: { type: DataTypes.TEXT, allowNull: true },
        // Meeting link if online class
        meeting_link: { type: DataTypes.TEXT, allowNull: true },
        // Status: scheduled, completed, cancelled
        status: { type: DataTypes.ENUM('scheduled', 'completed', 'cancelled'), defaultValue: 'scheduled' },
    }, {
        tableName: 'batch_classes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['batch_id'] },
            { fields: ['class_date'] },
            { fields: ['teacher_id'] },
            { fields: ['status'] },
        ],
    });

    BatchClass.associate = (models) => {
        BatchClass.belongsTo(models.Batch, { foreignKey: 'batch_id', as: 'batch' });
    };

    return BatchClass;
};

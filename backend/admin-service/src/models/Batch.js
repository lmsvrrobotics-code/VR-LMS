const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Batch = sequelize.define('Batch', {
    unique_id: { type: DataTypes.STRING(100), primaryKey: true, allowNull: false },
    display_name: { type: DataTypes.STRING(255), allowNull: true },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
    primary_teacher_id: { type: DataTypes.STRING(100), allowNull: false },
    clg_id: { type: DataTypes.STRING(100), allowNull: true },
    status: { type: DataTypes.STRING(50), defaultValue: 'active' },
  }, {
    tableName: 'batches',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  Batch.associate = (models) => {
    // Each batch belongs to ONE course
    Batch.belongsTo(models.Course, { foreignKey: 'course_id', as: 'course', targetKey: 'id' });
    // Each batch has ONE teacher (primary_teacher_id)
    Batch.belongsTo(models.User, { foreignKey: 'primary_teacher_id', as: 'teacher', targetKey: 'id' });
    // Each batch has MANY students
    Batch.hasMany(models.BatchMember, { foreignKey: 'batch_id', as: 'members' });
    // Batch classes
    Batch.hasMany(models.BatchClass, { foreignKey: 'batch_id', as: 'classes' });
    // Batch lesson releases
    Batch.hasMany(models.BatchLessonRelease, { foreignKey: 'batch_id', as: 'lesson_releases' });
  };

  return Batch;
};

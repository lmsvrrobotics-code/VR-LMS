const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BatchLessonRelease = sequelize.define('BatchLessonRelease', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batch_id: { type: DataTypes.STRING(100), allowNull: false },
    lesson_id: { type: DataTypes.INTEGER, allowNull: false },
    released_by: { type: DataTypes.STRING(100), allowNull: false },
  }, {
    tableName: 'batch_lesson_releases',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  BatchLessonRelease.associate = (models) => {
    BatchLessonRelease.belongsTo(models.Batch, { foreignKey: 'batch_id' });
    BatchLessonRelease.belongsTo(models.Lesson, { foreignKey: 'lesson_id' });
  };

  return BatchLessonRelease;
};

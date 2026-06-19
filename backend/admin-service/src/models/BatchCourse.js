const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BatchCourse = sequelize.define('BatchCourse', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batch_id: { type: DataTypes.STRING(100), allowNull: false },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'batch_courses',
    timestamps: false,
  });

  BatchCourse.associate = (models) => {
    BatchCourse.belongsTo(models.Batch, { foreignKey: 'batch_id', as: 'batch', targetKey: 'unique_id' });
    BatchCourse.belongsTo(models.Course, { foreignKey: 'course_id', as: 'Course' });
  };

  return BatchCourse;
};

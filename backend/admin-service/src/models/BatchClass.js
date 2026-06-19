const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BatchClass = sequelize.define('BatchClass', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batch_id: { type: DataTypes.STRING(100), allowNull: false },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
    class_date_time: { type: DataTypes.DATE, allowNull: false },
    primary_teacher_id: { type: DataTypes.STRING(100), allowNull: false },
    temporary_teacher_id: { type: DataTypes.STRING(100), allowNull: true },
    title: { type: DataTypes.STRING(255) },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING(50), defaultValue: 'scheduled' },
  }, {
    tableName: 'batch_classes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  BatchClass.associate = (models) => {
    BatchClass.belongsTo(models.Batch, { foreignKey: 'batch_id' });
    BatchClass.belongsTo(models.Course, { foreignKey: 'course_id' });
  };

  return BatchClass;
};

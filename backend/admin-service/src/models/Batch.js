const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  // Two batch flows share this table (see migration 19):
  //   BatchNewService — unique_id / course_id / primary_teacher_id / display_name
  //   BatchService    — id / name / description / start_date / end_date / is_active
  // so most columns are nullable: a batch created by one flow legitimately has
  // nothing in the other's fields. unique_id stays the primary key (the DB
  // defaults it) and `id` is the surrogate integer BatchService addresses.
  const Batch = sequelize.define('Batch', {
    // allowNull:true is deliberate even though the COLUMN is NOT NULL: migration
    // 19 gives unique_id a DB-side default, but Sequelize's own notNull check
    // runs BEFORE the insert and would reject a BatchService create (which has
    // no course/teacher to build an id from) before the default could apply.
    // BatchNewService always sets it explicitly.
    unique_id: { type: DataTypes.STRING(100), primaryKey: true, allowNull: true },
    // autoIncrement (SERIAL) so BatchService inserts don't have to supply it.
    id: { type: DataTypes.INTEGER, autoIncrement: true, allowNull: true },
    display_name: { type: DataTypes.STRING(255), allowNull: true },
    // Nullable: a BatchService batch attaches its course/teacher later. The
    // model previously declared these NOT NULL while the table did not, which
    // only ever produced confusing validation errors.
    course_id: { type: DataTypes.INTEGER, allowNull: true },
    primary_teacher_id: { type: DataTypes.STRING(100), allowNull: true },
    clg_id: { type: DataTypes.STRING(100), allowNull: true },
    status: { type: DataTypes.STRING(50), defaultValue: 'active' },
    name: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    start_date: { type: DataTypes.DATEONLY, allowNull: true },
    end_date: { type: DataTypes.DATEONLY, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
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

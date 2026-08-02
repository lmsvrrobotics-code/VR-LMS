const { DataTypes } = require('sequelize');

// Teachers assigned to a batch (many-to-many). Mirrors BatchMember, which does
// the same job for students. batches.primary_teacher_id still holds the single
// teacher BatchNewService assigns — this table is the multi-teacher roster the
// College → Add Batch form writes.
module.exports = (sequelize) => {
  const BatchTeacher = sequelize.define('BatchTeacher', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // FK to batches.unique_id (varchar PK), NOT the surrogate integer id.
    batch_id: { type: DataTypes.STRING(100), allowNull: false },
    // auth-service users.userId — an 11-digit string, not an int.
    user_id: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.STRING(50), defaultValue: 'active' },
    added_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'batch_teachers',
    timestamps: false,
  });

  BatchTeacher.associate = (models) => {
    BatchTeacher.belongsTo(models.Batch, { foreignKey: 'batch_id', as: 'batch', targetKey: 'unique_id' });
  };

  return BatchTeacher;
};

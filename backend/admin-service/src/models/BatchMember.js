const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BatchMember = sequelize.define('BatchMember', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batch_id: { type: DataTypes.STRING(100), allowNull: false },
    user_id: { type: DataTypes.STRING(255), allowNull: false },
    student_id: { type: DataTypes.STRING(100), allowNull: false },
    status: { type: DataTypes.STRING(50), defaultValue: 'active' },
    added_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'batch_members',
    timestamps: false,
  });

  BatchMember.associate = (models) => {
    BatchMember.belongsTo(models.Batch, { foreignKey: 'batch_id', as: 'batch', targetKey: 'unique_id' });
  };

  return BatchMember;
};

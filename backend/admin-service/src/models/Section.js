const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Section = sequelize.define('Section', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER },
        course_id: { type: DataTypes.INTEGER },
        title: { type: DataTypes.STRING(255) },
        // Session authoring fields (see migration 23). The UI calls a section a
        // "Session"; the table keeps its original name.
        image: { type: DataTypes.STRING(255) },
        description: { type: DataTypes.TEXT },
        sort: { type: DataTypes.INTEGER },
    }, { tableName: 'sections', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    Section.associate = (models) => {
        Section.belongsTo(models.Course, { foreignKey: 'course_id' });
        Section.hasMany(models.Lesson, { foreignKey: 'section_id', as: 'lessons' });
    };
    return Section;
};

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Question', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        quiz_id: { type: DataTypes.INTEGER },
        title: { type: DataTypes.TEXT('long') },
        type: { type: DataTypes.STRING(255) },
        answer: { type: DataTypes.TEXT('medium') },
        options: { type: DataTypes.TEXT('long') },
        // Optional per-question media. `image` holds what fileUploader
        // persists for a picture (R2 public URL or legacy "uploads/..." key);
        // `video` holds the Bunny Stream embed/HLS URL. Both NULL = text-only.
        image: { type: DataTypes.TEXT },
        video: { type: DataTypes.TEXT },
        sort: { type: DataTypes.INTEGER },
    }, { tableName: 'questions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
};

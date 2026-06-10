const { DataTypes } = require('sequelize');

// Marketing / demo videos an admin uploads to attract newly-registered students
// (e.g. the CEO's intro to VR Robotics + sample course teasers). Shown on the
// student dashboard above the course cards. Mirrors the Gallery model + upload
// pipeline (image → R2, video → Bunny embed url via helpers/fileUploader).
module.exports = (sequelize) => {
    const DemoVideo = sequelize.define('DemoVideo', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        // 'video' | 'image' (thumbnail card) — detected from the upload.
        media_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'video' },
        // Bunny embed URL for videos, R2 public URL for images.
        media_url: { type: DataTypes.TEXT, allowNull: true },
        // The single "intro" video (CEO welcome) shown prominently/first.
        is_intro: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        // Display ordering — lower shows first; ties break on newest.
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // 1 = visible to students, 0 = hidden/draft.
        status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    }, { tableName: 'demo_videos', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    return DemoVideo;
};

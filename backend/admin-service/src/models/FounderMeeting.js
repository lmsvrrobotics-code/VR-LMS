const { DataTypes } = require('sequelize');

// "Weekly Meeting with Founder" — an admin-managed announcement carrying a
// scheduled live session, an optional promo/recorded video and a poster image.
// The featured row is rendered on the public home page under the hero.
//
// Uploads follow the DemoVideo pipeline (video → Bunny embed URL, image → R2
// public URL) via helpers/fileUploader.
module.exports = (sequelize) => {
    const FounderMeeting = sequelize.define('FounderMeeting', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        // NULL = announced with no fixed slot yet; the UI omits the countdown.
        scheduled_at: { type: DataTypes.DATE, allowNull: true },
        // Minutes. Keeps the join link live for the length of the call rather
        // than expiring it the moment the start time passes.
        duration_mins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
        meeting_link: { type: DataTypes.TEXT, allowNull: true },
        video_url: { type: DataTypes.TEXT, allowNull: true },
        poster_url: { type: DataTypes.TEXT, allowNull: true },
        // Registration (migration 25). The join link is not published on the
        // public page — visitors register and the link is released to them —
        // so these two govern whether that form is available.
        registration_open: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        // NULL = unlimited seats.
        capacity: { type: DataTypes.INTEGER, allowNull: true },
        // Only one row may be true — enforced by a partial unique index
        // (migration 24) as well as by the service.
        is_featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        // 1 = published, 0 = draft.
        status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    }, {
        tableName: 'founder_meetings',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    return FounderMeeting;
};

const { DataTypes } = require('sequelize');

// A signup for a "Weekly Meeting with Founder".
//
// The public page no longer publishes the join link: visitors register, and
// the link is released to them on confirmation. This table is what the admin
// reads to see who is coming.
module.exports = (sequelize) => {
    const FounderMeetingRegistration = sequelize.define('FounderMeetingRegistration', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        meeting_id: { type: DataTypes.INTEGER, allowNull: false },
        name: { type: DataTypes.STRING(150), allowNull: false },
        // Stored lowercased so the (meeting_id, email) unique index actually
        // catches the same person signing up twice with different casing.
        email: { type: DataTypes.STRING(254), allowNull: false },
        phone: { type: DataTypes.STRING(20), allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: true },
        // Present when a logged-in student registers; NULL for a visitor.
        // VARCHAR: auth-service ids are 11-digit strings, not integers.
        user_id: { type: DataTypes.STRING(64), allowNull: true },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'registered' },
    }, {
        tableName: 'founder_meeting_registrations',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    return FounderMeetingRegistration;
};

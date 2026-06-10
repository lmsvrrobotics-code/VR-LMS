const { DataTypes } = require('sequelize');

// A "Send us a Message" submission from the public Contact page. No login —
// anyone can submit; the admin reads them in the dashboard and marks them
// read / deletes them. Lives in lms_admin, created on boot via Model.sync().
module.exports = (sequelize) => {
    const ContactMessage = sequelize.define('ContactMessage', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        first_name: { type: DataTypes.STRING(120), allowNull: false },
        last_name: { type: DataTypes.STRING(120), allowNull: true },
        email: { type: DataTypes.STRING(190), allowNull: false },
        subject: { type: DataTypes.STRING(255), allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: false },
        // new → read (admin triage). Drives the unread badge.
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'new' },
    }, {
        tableName: 'contact_messages',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['status'] },
            { fields: ['created_at'] },
        ],
    });

    return ContactMessage;
};

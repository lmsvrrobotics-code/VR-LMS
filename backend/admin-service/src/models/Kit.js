const { DataTypes } = require('sequelize');

// Robotics kits shown on the public Kits page (Home → Books → Kits).
// Created/managed by admins via Books → Add/Manage Kits. `cover_url` is
// the public R2 image URL. Price is set by admin; students pay exactly that amount.
module.exports = (sequelize) => {
    const Kit = sequelize.define('Kit', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        subtitle: { type: DataTypes.STRING(255), allowNull: true },
        description: { type: DataTypes.TEXT, allowNull: true },
        // R2 public URL for the cover image.
        cover_url: { type: DataTypes.TEXT, allowNull: true },
        // Razorpay payment link for purchasing this kit.
        buy_url: { type: DataTypes.TEXT, allowNull: true },
        // Price in rupees. Admin sets this; students pay exactly this amount.
        price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        // Display ordering — lower shows first; ties break on newest.
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // 1 = visible on the public site, 0 = hidden/draft.
        status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    }, { tableName: 'kits', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    return Kit;
};

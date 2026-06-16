const { DataTypes } = require('sequelize');

// Books shown on the public Books page (Home → Books). Created/managed by
// admins via Books → Add/Manage Books. `cover_url` is the public R2 image URL
// for the cover (produced by helpers/fileUploader.upload). `buy_url` is an
// optional "Order Now" link; the public page falls back to /contact when null.
module.exports = (sequelize) => {
    const Book = sequelize.define('Book', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        // Short tagline shown under the title on the card.
        subtitle: { type: DataTypes.STRING(255), allowNull: true },
        // Longer optional description.
        description: { type: DataTypes.TEXT, allowNull: true },
        // R2 public URL for the cover image.
        cover_url: { type: DataTypes.TEXT, allowNull: true },
        // Price in rupees. Admin sets this; students pay exactly this amount.
        price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        // Optional external "Order Now" link; null → public page uses /contact.
        buy_url: { type: DataTypes.TEXT, allowNull: true },
        // Display ordering — lower shows first; ties break on newest.
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // 1 = visible on the public site, 0 = hidden/draft. SMALLINT (not
        // TINYINT — Postgres has no TINYINT) so Book.sync() can create the
        // table cleanly on first boot.
        status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    }, { tableName: 'books', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    return Book;
};

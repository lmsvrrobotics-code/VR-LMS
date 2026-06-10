const { DataTypes } = require('sequelize');

// Learning centers shown on the public Locations page. Created/managed by
// admins via Locations → Add/Manage Locations. Replaces the old hardcoded
// `centers` array. `photo_url` is an optional image URL (the card falls back to
// a coloured placeholder when empty); `map_url` is an optional explicit Google
// Maps link (the public page builds a search link from the address when empty).
module.exports = (sequelize) => {
    const Location = sequelize.define('Location', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        // Centre name, e.g. "Guntur (HQ)".
        name: { type: DataTypes.STRING(255), allowNull: false },
        // City, e.g. "Guntur".
        city: { type: DataTypes.STRING(255), allowNull: true },
        // State, e.g. "Andhra Pradesh".
        state: { type: DataTypes.STRING(255), allowNull: true },
        // Postal PIN code shown on the card.
        pin: { type: DataTypes.STRING(20), allowNull: true },
        // Optional centre photo URL (empty → coloured placeholder on the card).
        photo_url: { type: DataTypes.TEXT, allowNull: true },
        // Optional explicit Google Maps link (empty → built from the address).
        map_url: { type: DataTypes.TEXT, allowNull: true },
        // 1 = show the "New" ribbon on the card.
        is_new: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
        // Display ordering — lower shows first; ties break on newest.
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // 1 = visible on the public site, 0 = hidden/draft. SMALLINT (not
        // TINYINT — Postgres has no TINYINT) so Location.sync() can create the
        // table cleanly on first boot.
        status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    }, { tableName: 'locations', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    return Location;
};

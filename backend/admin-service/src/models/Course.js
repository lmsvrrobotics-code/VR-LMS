const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Course = sequelize.define('Course', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(255) },
        short_description: { type: DataTypes.TEXT },
        user_id: { type: DataTypes.INTEGER },
        category_id: { type: DataTypes.INTEGER },
        course_type: { type: DataTypes.STRING(50), defaultValue: 'general' },
        status: { type: DataTypes.STRING(50), defaultValue: 'active' },
        level: { type: DataTypes.STRING(50) },
        language: { type: DataTypes.STRING(50) },
        // Class-access range. A course is accessible to classes within
        // [class_from, class_to]. NULL = no restriction (open to all classes).
        class_from: { type: DataTypes.SMALLINT, allowNull: true },
        class_to: { type: DataTypes.SMALLINT, allowNull: true },
        is_paid: { type: DataTypes.BOOLEAN, defaultValue: false },
        is_best: { type: DataTypes.BOOLEAN, defaultValue: false },
        // Free public sample/teaser course — visible & fully playable to every
        // registered student (bypasses payment + release gating) to attract
        // new sign-ups. Managed by the "Marketing course" toggle on the course.
        is_marketing: { type: DataTypes.BOOLEAN, defaultValue: false },
        price: { type: DataTypes.FLOAT, defaultValue: 0 },
        discounted_price: { type: DataTypes.FLOAT, defaultValue: 0 },
        discount_flag: { type: DataTypes.BOOLEAN, defaultValue: false },
        enable_drip_content: { type: DataTypes.BOOLEAN, defaultValue: false },
        drip_content_settings: { type: DataTypes.TEXT },
        meta_keywords: { type: DataTypes.TEXT },
        meta_description: { type: DataTypes.TEXT },
        thumbnail: { type: DataTypes.STRING(255) },
        banner: { type: DataTypes.STRING(255) },
        preview: { type: DataTypes.STRING(255) },
        description: { type: DataTypes.TEXT('long') },
        requirements: { type: DataTypes.TEXT },
        outcomes: { type: DataTypes.TEXT },
        faqs: { type: DataTypes.TEXT },
        teacher_ids: { type: DataTypes.TEXT },
        // Array of clgIds (college-service primary key strings) the course is
        // offered at. No FK because colleges live in lucy_devdb, not lms_admin.
        // Validated at the service layer against college-service.
        clg_ids: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
        // Batch IDs (lms_admin.batches.id) this course is scoped to. Optional —
        // a course can be scoped to colleges only (clg_ids) and skip batches.
        // Stored as JSON for the same reason clg_ids is JSON: variable-length,
        // never joined at the DB level.
        batch_ids: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
        average_rating: { type: DataTypes.FLOAT, defaultValue: 0 },
        expiry_period: { type: DataTypes.INTEGER, allowNull: true },
        // Admin-set "out of" for the Score row on the course-details page. The
        // student's earned points come from the per-course leaderboard
        // (RankingService); this is just the denominator the admin chooses.
        // NULL = no max set (the page then shows the earned points alone).
        score_max: { type: DataTypes.INTEGER, allowNull: true },
        // Admin-set free text for the "Lectures" row on course-details
        // (e.g. "2 Hours/ Week"). NULL/empty renders as "—".
        lectures_label: { type: DataTypes.STRING(255), allowNull: true },
        // Whether completion of this course grants a certificate. Surfaced on
        // the public course-details page (the "Includes certificate" line) and
        // gates the certificate-issue flow.
        has_certificate: { type: DataTypes.BOOLEAN, defaultValue: true },
        // Bunny Stream collection (folder) GUID. Created lazily on the first
        // video upload for this course so every lesson video for the same
        // course is grouped in one Bunny collection — matches the per-course
        // layout we use for R2 assets (courses/<id>/...).
        bunny_collection_id: { type: DataTypes.STRING(64), allowNull: true },
    }, { tableName: 'courses', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

    Course.associate = (models) => {
        Course.belongsTo(models.Category, { foreignKey: 'category_id' });
        Course.belongsTo(models.User, { as: 'creator', foreignKey: 'user_id' });
    };

    return Course;
};

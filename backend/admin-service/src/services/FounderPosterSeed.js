const fs = require('fs');
const path = require('path');
const { AppSetting } = require('../models');
const { upload } = require('../helpers/fileUploader');

/**
 * Default poster for "Weekly Meeting with Founder", stored in Cloudflare R2.
 *
 * A meeting created without its own poster inherits this one. Rather than
 * hardcoding a path into the frontend (which breaks the moment the file is not
 * on the web server), the image is uploaded to R2 ONCE and the resulting public
 * URL is remembered in app_settings. From then on every meeting — and the home
 * page — reads that R2 URL, exactly like an admin-uploaded poster.
 *
 * Seeding source: `assets/founder-meeting-poster.png` under the service root.
 * Drop the flyer there and the first request that needs a default uploads it.
 * An admin who uploads a poster through the UI overrides it per meeting, and
 * `setDefaultPosterUrl` lets one be pointed at any existing URL instead.
 */

const SETTING_KEY = 'founder_meeting_default_poster';

// Where the seed image is expected. `src/services` → service root → assets/.
const SEED_PATH = path.resolve(__dirname, '..', '..', 'assets', 'founder-meeting-poster.png');

// Cached in-process so a hot home page does not hit app_settings every request.
// Null means "not looked up yet"; a resolved miss caches as '' (see below).
let cached = null;

const readSetting = async () => {
    const row = await AppSetting.findOne({ where: { key: SETTING_KEY } });
    return row?.value || '';
};

const writeSetting = async (value) => {
    const [row, created] = await AppSetting.findOrCreate({
        where: { key: SETTING_KEY },
        defaults: { key: SETTING_KEY, value },
    });
    if (!created) await row.update({ value });
    return value;
};

/**
 * Upload the seed file to R2 and remember its URL.
 * Returns '' when no seed file is present — the caller then simply has no
 * default, which is a valid state, not an error.
 */
const seedFromDisk = async () => {
    if (!fs.existsSync(SEED_PATH)) return '';
    // Shape a multer-like object: R2Storage.uploadFile reads `path` and streams
    // from disk, so no buffer is loaded into memory.
    const file = {
        path: SEED_PATH,
        originalname: 'founder-meeting-poster.png',
        mimetype: 'image/png',
    };
    const url = await upload(file, 'uploads/founder/posters/default-founder-meeting.png', 1600, 900);
    if (!url) return '';
    await writeSetting(url);
    return url;
};

/**
 * The default poster URL, seeding R2 on first use.
 *
 * Never throws: a marketing image failing to resolve must not take down the
 * home page or the admin list, so every failure degrades to "no default".
 */
const getDefaultPosterUrl = async () => {
    if (cached !== null) return cached;
    try {
        const stored = await readSetting();
        if (stored) { cached = stored; return cached; }
        cached = await seedFromDisk();
        return cached;
    } catch (e) {
        console.warn('[founder-poster] default lookup failed:', e.message);
        // Do NOT cache a transient failure — a DB blip should not disable the
        // default for the life of the process.
        return '';
    }
};

/** Point the default at an already-hosted image (no upload). */
const setDefaultPosterUrl = async (url) => {
    const value = String(url || '').trim();
    await writeSetting(value);
    cached = value;
    return value;
};

/** Test/CLI hook: forget the in-process cache. */
const resetCache = () => { cached = null; };

module.exports = {
    SETTING_KEY,
    SEED_PATH,
    getDefaultPosterUrl,
    setDefaultPosterUrl,
    resetCache,
};

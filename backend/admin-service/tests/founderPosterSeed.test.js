// Tests for the default founder-meeting poster stored in Cloudflare R2.
//
// The design being pinned down: the default is DATA, not a hardcoded path.
// It is uploaded to R2 once and its URL remembered in app_settings, so the
// admin can change the artwork without a code change and the image resolves
// from any host. A "/founder-meeting-poster.png" style path only works if the
// file happens to ship with the frontend.
//
// The riskiest behaviour here is deletion: every meeting without its own
// poster points at the SAME R2 object, so removing one meeting must never
// sweep it.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let settingRow = null;

/** A stand-in for a Sequelize row: plain data plus the .update() it carries. */
const makeRow = (value) => {
    const row = { key: 'founder_meeting_default_poster', value };
    row.update = async (patch) => { Object.assign(row, patch); return row; };
    return row;
};
let uploads = [];
let uploadResult = 'https://cdn.example.com/uploads/founder/posters/default.png';

stub('../src/models', {
    AppSetting: {
        findOne: async () => settingRow,
        findOrCreate: async ({ defaults }) => {
            if (settingRow) return [settingRow, false];
            settingRow = {
                ...defaults,
                update: async (patch) => { Object.assign(settingRow, patch); },
            };
            return [settingRow, true];
        },
    },
});
stub('../src/helpers/fileUploader', {
    upload: async (file, dest) => { uploads.push({ file, dest }); return uploadResult; },
    removeFile: async () => {},
    niceFileName: (n, e) => `${n}.${e}`,
});

const seedPath = require.resolve('../src/services/FounderPosterSeed');
delete require.cache[seedPath];
const seed = require(seedPath);

beforeEach(() => {
    settingRow = null;
    uploads = [];
    uploadResult = 'https://cdn.example.com/uploads/founder/posters/default.png';
    seed.resetCache();
});

// --- reading the stored default ---------------------------------------------

test('a stored URL is returned without re-uploading', async () => {
    settingRow = makeRow('https://cdn.example.com/existing.png');
    const url = await seed.getDefaultPosterUrl();
    assert.equal(url, 'https://cdn.example.com/existing.png');
    assert.equal(uploads.length, 0, 'an existing default must not be re-uploaded');
});

test('the result is cached in-process', async () => {
    settingRow = makeRow('https://cdn.example.com/existing.png');
    await seed.getDefaultPosterUrl();
    settingRow = null; // a second DB read would now return nothing
    assert.equal(await seed.getDefaultPosterUrl(), 'https://cdn.example.com/existing.png');
});

test('resetCache forces a fresh lookup', async () => {
    settingRow = makeRow('https://cdn.example.com/a.png');
    await seed.getDefaultPosterUrl();
    settingRow = makeRow('https://cdn.example.com/b.png');
    seed.resetCache();
    assert.equal(await seed.getDefaultPosterUrl(), 'https://cdn.example.com/b.png');
});

// --- no default configured ---------------------------------------------------

test('a missing seed file yields no default rather than an error', async () => {
    // The seed image is optional: with no file and no stored URL the feature
    // simply has no default poster, which is a valid state.
    const url = await seed.getDefaultPosterUrl();
    assert.equal(url, '');
});

test('a DB failure degrades to no default and is NOT cached', async () => {
    // Caching a transient failure would disable the default for the life of
    // the process.
    const { AppSetting } = require('../src/models');
    const original = AppSetting.findOne;
    AppSetting.findOne = async () => { throw new Error('connection reset'); };
    assert.equal(await seed.getDefaultPosterUrl(), '');

    AppSetting.findOne = async () => makeRow('https://cdn.example.com/back.png');
    assert.equal(
        await seed.getDefaultPosterUrl(),
        'https://cdn.example.com/back.png',
        'a recovered DB must resolve the default again',
    );
    AppSetting.findOne = original;
});

// --- pointing at a hosted image ---------------------------------------------

test('the default can be set to an already-hosted URL without uploading', async () => {
    const saved = await seed.setDefaultPosterUrl('https://cdn.example.com/flyer.png');
    assert.equal(saved, 'https://cdn.example.com/flyer.png');
    assert.equal(uploads.length, 0);
    assert.equal(await seed.getDefaultPosterUrl(), 'https://cdn.example.com/flyer.png');
});

test('setting the default updates the in-process cache immediately', async () => {
    settingRow = makeRow('https://cdn.example.com/old.png');
    await seed.getDefaultPosterUrl();
    await seed.setDefaultPosterUrl('https://cdn.example.com/new.png');
    assert.equal(await seed.getDefaultPosterUrl(), 'https://cdn.example.com/new.png');
});

test('the default can be cleared', async () => {
    await seed.setDefaultPosterUrl('https://cdn.example.com/flyer.png');
    await seed.setDefaultPosterUrl('');
    assert.equal(await seed.getDefaultPosterUrl(), '');
});

// --- the setting key --------------------------------------------------------

test('the setting key is stable', () => {
    // Changing it would silently orphan the stored URL and re-upload.
    assert.equal(seed.SETTING_KEY, 'founder_meeting_default_poster');
});

test('the seed path points at the service assets folder', () => {
    assert.match(seed.SEED_PATH.replace(/\\/g, '/'), /assets\/founder-meeting-poster\.png$/);
});

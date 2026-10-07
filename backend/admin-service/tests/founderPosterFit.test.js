/**
 * The founder-meeting poster must survive upload INTACT.
 *
 * R2Storage.uploadFile resizes images with sharp before storing them. It used
 * to hardcode `fit: 'cover'`, which fills the target box and CROPS the
 * overflow. For avatars and card thumbnails that is correct. For a marketing
 * poster it is destructive: the crop happens at upload time, so the discarded
 * edges never reach R2 and no amount of CSS on the public page can recover
 * them. That is what cut the academy logo and the "Register now" button off the
 * founder flyer.
 *
 * Posters now upload with fit:'contain', which letterboxes instead. These tests
 * exercise sharp directly — the same library and options the uploader uses — so
 * they prove the pixel-level behaviour rather than just asserting on strings.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

const POSTER_W = 1600;
const POSTER_H = 900;

// A solid-colour image of a given size, as a PNG buffer.
const makeImage = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 220, g: 90, b: 20, alpha: 1 } } })
    .png()
    .toBuffer();

// Count the non-transparent pixels — i.e. how much real artwork survived.
const artworkPixels = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 0) n += 1;
  }
  return n;
};

// Mirrors the resize branch of R2Storage.uploadFile for fit:'contain'.
const containResize = (buf) =>
  sharp(buf)
    .resize(POSTER_W, POSTER_H, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .toBuffer();

test('an exact 1600x900 poster is stored pixel-for-pixel', async () => {
  const src = await makeImage(POSTER_W, POSTER_H);
  const out = await containResize(src);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, POSTER_W);
  assert.equal(meta.height, POSTER_H);
  // Nothing letterboxed, nothing cropped: every pixel is artwork.
  assert.equal(await artworkPixels(out), POSTER_W * POSTER_H);
});

test('an off-ratio poster keeps ALL of its artwork (contain, not cover)', async () => {
  // 4:3 — the shape that previously lost its top and bottom to cover-fit.
  const src = await makeImage(1200, 900);
  const before = await artworkPixels(src);

  const contained = await containResize(src);
  const cover = await sharp(src).resize(POSTER_W, POSTER_H, { fit: 'cover' }).toBuffer();

  // Contain scales the whole image down to fit, so every source pixel is still
  // represented and the result is strictly smaller than the full box (the rest
  // is transparent letterboxing).
  const keptContain = await artworkPixels(contained);
  assert.ok(keptContain > 0 && keptContain < POSTER_W * POSTER_H,
    'a 4:3 source must be letterboxed inside the 16:9 box');

  // Cover fills the entire box precisely BECAUSE it threw the overflow away.
  assert.equal(await artworkPixels(cover), POSTER_W * POSTER_H);

  // The regression guard: contain must not fill the frame the way cover does.
  assert.notEqual(keptContain, POSTER_W * POSTER_H,
    'filling the whole frame means the edges were cropped — the original bug');
  assert.ok(before > 0);
});

test('a small poster is not blurrily upscaled', async () => {
  const src = await makeImage(800, 450); // correct 16:9, half size
  const out = await containResize(src);
  const meta = await sharp(out).metadata();
  // The canvas is still the target box, but the artwork keeps its own scale.
  assert.equal(meta.width, POSTER_W);
  assert.equal(meta.height, POSTER_H);
  assert.ok(await artworkPixels(out) <= 800 * 450 + 1,
    'withoutEnlargement must stop a small image being stretched up');
});

test('the uploader forwards a contain fit for posters', () => {
  // Strip comments: these files EXPLAIN the bug in prose, and naming
  // fit:'contain' in a comment must not count as actually passing it.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  const svc = stripComments(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'FounderMeetingService.js'), 'utf8'));
  assert.match(svc, /fit:\s*'contain'/, 'poster uploads must opt into contain-fit');
  assert.match(svc, new RegExp(String(POSTER_W)), 'the stored width must stay 1600');

  const r2 = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'R2Storage.js'), 'utf8');
  assert.match(r2, /resize\.fit \|\| 'cover'/,
    'R2Storage must honour a caller-supplied fit while defaulting to cover');
  assert.match(r2, /withoutEnlargement/, 'small images must not be upscaled');
});

test('non-poster uploads still default to cover', () => {
  // Avatars and card thumbnails want a consistent shape; this must not change.
  const r2 = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'R2Storage.js'), 'utf8');
  assert.match(r2, /const fit = resize\.fit \|\| 'cover';/);
});

/**
 * The registration confirmation must not promise a link it has no way to show.
 *
 * `success` was unconditionally "You are registered. The joining link is
 * below." — but meeting_link is nullable, so when the admin has not set one the
 * dialog said the link was below while showing nothing there.
 */
test('the confirmation only promises a joining link when one exists', () => {
  const svc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'FounderMeetingService.js'), 'utf8');
  // The promise must sit behind SOME condition, not be stated unconditionally.
  // Which condition is deliberately not pinned: it started as "is there a
  // link?" and now also folds in the one-hour join window (`linkReady`), and
  // the guarantee — never claim a link the response is not returning — is the
  // same either way.
  assert.match(
    svc,
    /(linkReady|meeting\.meeting_link)\s*\n?\s*\?\s*'You are registered\. The joining link is below\.'/,
    'the link promise must be conditional on a link actually being returned',
  );
  assert.match(svc, /:\s*'Your seat is confirmed\.'/,
    'a meeting with no usable link still needs an honest confirmation');
  // And the condition must be the SAME one that decides what is sent, so the
  // wording and the payload can never disagree.
  assert.match(svc, /meeting_link: linkReady \? meeting\.meeting_link : null/,
    'the copy and the returned link must be driven by one flag');
});

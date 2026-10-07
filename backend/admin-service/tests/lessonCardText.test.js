/**
 * Class cards show a plain-text blurb, never markup.
 *
 * Lesson descriptions became rich HTML when the admin form gained an editor.
 * The course-details card renders that value as TEXT, so a description written
 * in the editor showed up on the student's page as
 * "bhnjhb<div><br></div><div>thjkl</div>" — tags and all.
 *
 * `card_text` is computed server-side so every consumer (the card, the search
 * filter) gets the same clean string instead of each re-deriving it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Extract the pure helper rather than importing the module, which opens a DB
// connection on require.
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'course-content', 'PublicCourseService.js'), 'utf8');
const body = SRC.slice(SRC.indexOf('const cardText ='), SRC.indexOf('const sanitizeCourse ='));
// eslint-disable-next-line no-eval
const cardText = eval('(' + body.replace('const cardText = ', '').trim().replace(/;$/, '') + ')');

test('markup never reaches a card', () => {
  // The exact value that was rendering tags on the live course page.
  assert.equal(
    cardText({ description: 'bhnjhb<div><br></div><div>thjkl</div><div><br></div><div>rfyguhij</div>' }),
    'bhnjhb thjkl rfyguhij',
  );
  assert.ok(!/[<>]/.test(cardText({ description: '<p>a</p><ul><li>b</li></ul>' })));
});

test('block tags become a space, not nothing', () => {
  // Stripping them outright would run words together: "a</div><div>b" → "ab".
  assert.equal(cardText({ description: 'a</div><div>b' }), 'a b');
  assert.equal(cardText({ description: '<ul><li>one</li><li>two</li></ul>' }), 'one two');
});

test("the admin's summary wins when they wrote one", () => {
  assert.equal(
    cardText({ summary: 'A short blurb', description: '<b>ignored</b>' }),
    'A short blurb',
  );
  // A whitespace-only summary is not a summary — fall back rather than render
  // an empty card.
  assert.equal(cardText({ summary: '   ', description: '<p>Falls back</p>' }), 'Falls back');
});

test('a multi-line summary collapses to one line', () => {
  // A card is a single clamped line, so the author's newlines would otherwise
  // render as a run-on string.
  assert.equal(cardText({ summary: 'Line one\r\n\r\nLine two' }), 'Line one Line two');
});

test('entities an editor emits are decoded', () => {
  assert.equal(
    cardText({ description: '<p>Tom&nbsp;&amp;&nbsp;Jerry &quot;hi&quot;</p>' }),
    'Tom & Jerry "hi"',
  );
});

test('plain and empty values are left alone', () => {
  assert.equal(cardText({ description: 'Already plain.' }), 'Already plain.');
  assert.equal(cardText({ description: '' }), '');
  assert.equal(cardText({}), '');
  assert.equal(cardText(null), '');
});

test('the payload exposes card_text alongside the raw description', () => {
  // The raw description must STAY: the player renders it properly through a
  // sanitizer, where the formatting is the point.
  assert.match(SRC, /card_text: cardText\(l\)/, 'lessons must carry card_text');
  assert.match(SRC, /description: l\.description \|\| ''/, 'the rich description must remain');
});

/**
 * The founder-meeting poster must be shown at the ratio it is STORED at.
 *
 * Every poster — the admin's upload and the seeded default alike — is resized
 * server-side to 1600x900 with cover-fit (FounderMeetingService.storeUpload and
 * FounderPosterSeed). The public page used to render that 16:9 image with
 * `h-full`, which stretched it to match the taller details rail beside it; with
 * object-cover the left and right edges were then sliced off, cutting the
 * academy logo and the "Register now" button out of the flyer.
 *
 * These assertions pin the two halves together, so changing the stored size
 * without changing the slot (or vice versa) fails loudly instead of silently
 * cropping marketing artwork again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..', '..');
const PUBLIC_SECTION = join(FRONTEND, 'src', 'components', 'home', 'FounderMeetingSection.tsx');
const ADMIN_FORM = join(FRONTEND, 'src', 'admin', 'pages', 'founder-meetings', 'Index.jsx');

// The size the server stores. Kept as literals so a backend change that is not
// mirrored in the UI copy shows up here.
const STORED_W = 1600;
const STORED_H = 900;

const posterImgTag = (src) => {
  // The <img> whose src is the resolved poster, in the public media slot.
  const m = src.match(/<img\s[^>]*src=\{poster\}[\s\S]*?\/>/);
  assert.ok(m, 'could not find the poster <img> in FounderMeetingSection');
  return m[0];
};

test('the public poster slot keeps the stored 16:9 ratio', () => {
  const tag = posterImgTag(readFileSync(PUBLIC_SECTION, 'utf8'));
  assert.match(tag, /aspect-video/, 'the slot must be pinned to 16:9, not stretched to its neighbour');
  assert.ok(
    !/\bh-full\b/.test(tag),
    'h-full makes the poster match the taller details rail, which crops its sides',
  );
});

test('the public poster is never cropped by the browser', () => {
  const tag = posterImgTag(readFileSync(PUBLIC_SECTION, 'utf8'));
  assert.match(tag, /object-contain/, 'object-contain letterboxes an odd-sized poster instead of slicing it');
  assert.ok(!/object-cover/.test(tag), 'object-cover is what cut the logo and CTA off the flyer');
});

test('the stored poster size is 16:9', () => {
  assert.equal(STORED_W / STORED_H, 16 / 9, 'the slot assumes 16:9; update it if the stored size changes');
});

test('the admin form states the exact poster size to upload', () => {
  const src = readFileSync(ADMIN_FORM, 'utf8');
  // The admin has no other way to learn the upload is resized and cropped.
  assert.match(src, new RegExp(String(STORED_W)), 'the form must name the stored width');
  assert.match(src, new RegExp(String(STORED_H)), 'the form must name the stored height');
  assert.match(src, /16:9/, 'the form must state the aspect ratio');
  assert.match(src, /crop/i, 'the form must warn that off-ratio artwork is cropped');
});

test('the admin preview shows the poster the same way the public page does', () => {
  const src = readFileSync(ADMIN_FORM, 'utf8');
  const preview = src.match(/<img\s[^>]*src=\{initial\.poster_url\}[\s\S]*?\/>/);
  assert.ok(preview, 'could not find the poster preview in the admin form');
  assert.match(preview[0], /aspect-video/, 'preview must use the same 16:9 box as the live page');
  assert.match(
    preview[0],
    /object-contain/,
    'a cover-fit preview would crop while the live page does not, so the admin could not trust it',
  );
});

/**
 * The poster backdrop is decoration, and decoration has rules.
 *
 * The media column is a 16:9 poster inside a taller card, so there is always
 * space around the artwork. That space is now a layered "studio" ground
 * (blueprint grid, drifting brand orbs, concentric rings, vignette) instead of
 * a flat panel. Because it sits UNDER an image and NEXT TO a clickable card, it
 * must be invisible to assistive tech, must never swallow a pointer event, and
 * must stop moving for anyone who asks for reduced motion.
 */
test('the poster backdrop is inert decoration', () => {
  // The wrapper that holds every decorative layer.
  const SRC = readFileSync(PUBLIC_SECTION, 'utf8');
  const m = SRC.match(/<div aria-hidden="true" className="pointer-events-none absolute inset-0">([\s\S]*?)\n              <\/div>/);
  assert.ok(m, 'expected an aria-hidden, pointer-events-none backdrop wrapper');
  const layer = m[1];
  assert.ok(
    !/onClick|href=|<button|<a\s/.test(layer),
    'the backdrop must hold no interactive elements',
  );
  assert.match(layer, /backgroundImage/, 'expected the blueprint grid layer');
  assert.match(layer, /radial-gradient/, 'expected the vignette layer');
});

test('backdrop motion reuses helpers that honour prefers-reduced-motion', () => {
  // index.css already disables these under a reduced-motion query, so reusing
  // them adds no animation a user cannot switch off.
  const SRC = readFileSync(PUBLIC_SECTION, 'utf8');
  const css = readFileSync(join(FRONTEND, 'src', 'index.css'), 'utf8');
  const used = ['animate-orb-drift', 'animate-glow-pulse', 'animate-ring-spin'];
  for (const cls of used) {
    assert.ok(SRC.includes(cls), `backdrop should use the existing ${cls} helper`);
  }
  const guard = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\}\s*\}/g) || [];
  const guarded = guard.join('\n');
  for (const cls of used) {
    assert.ok(
      guarded.includes('.' + cls),
      `${cls} must be disabled under prefers-reduced-motion in index.css`,
    );
  }
});

test('the poster sits above its backdrop', () => {
  // Without an explicit stacking context the decorative layers would cover the
  // artwork they exist to frame.
  const img = posterImgTag(readFileSync(PUBLIC_SECTION, 'utf8'));
  assert.match(img, /z-10/, 'the poster must be raised above the backdrop');
  assert.match(img, /object-contain/, 'the poster must still never be cropped');
});

/**
 * The animated card border has a few properties that are easy to break.
 *
 * It is NOT an animated conic-gradient: interpolating one needs an `@property`
 * registered custom property, which is Safari 16.4+ only and silently fails to
 * animate elsewhere (the gradient just snaps, or sits still). Instead a child
 * sheet carries the gradient and ROTATES, which is a plain transform — it works
 * in every browser and stays on the compositor.
 *
 * That design only holds if three things stay true: the spinning sheet is
 * oversized enough to cover the corners as it turns, an opaque inner surface
 * masks all but the rim, and the spin stops for prefers-reduced-motion.
 */
// index.css with /* ... */ comments removed. The stylesheet EXPLAINS why
// @property is avoided, and that prose must not read as a use of it.
const cssCode = () =>
  readFileSync(join(FRONTEND, 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the card border spins a transform, not an unsupported @property gradient', () => {
  const css = cssCode();
  const block = css.slice(css.indexOf('.glow-border {'));
  assert.ok(block, 'expected a .glow-border rule');
  assert.match(block, /@keyframes glow-border-spin/, 'the edge must animate via keyframes');
  assert.match(block, /rotate:\s*360deg/, 'the spin must be a transform, not a gradient angle');
  assert.ok(
    !/@property\s+--/.test(css),
    '@property is Safari 16.4+ only — the border must not depend on it',
  );
});

test('the spinning sheet is oversized so no corner is ever bare', () => {
  const css = cssCode();
  const before = css.slice(css.indexOf('.glow-border::before'), css.indexOf('.glow-border__inner'));
  assert.match(before, /conic-gradient/, 'the edge colour comes from a conic gradient');
  const width = before.match(/width:\s*(\d+)%/);
  assert.ok(width, 'the sheet needs an explicit width');
  assert.ok(
    Number(width[1]) >= 150,
    'a square sheet must exceed the card diagonal or corners go bare mid-rotation',
  );
  assert.match(before, /aspect-ratio:\s*1/, 'the sheet must be square to sweep evenly');
});

test('an opaque inner surface masks all but the rim', () => {
  const css = cssCode();
  assert.match(css, /\.glow-border__inner \{[\s\S]*?z-index: 1;/,
    'the inner card must stack above the gradient sheet');

  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  assert.match(src, /glow-border__inner[^"]*bg-card/,
    'the inner surface must be opaque or the whole card glows, not just its edge');
  // The wrapper's padding IS the visible border width, and its radius must
  // exceed the inner one by that padding or the rim pinches at the corners.
  // Asserted as a relationship rather than fixed numbers, so the border can be
  // retuned without rewriting the test.
  const outer = src.match(/glow-border rounded-\[(\d+)px\] p-\[([\d.]+)px\]/);
  assert.ok(outer, 'expected the glow-border wrapper with an explicit radius and padding');
  const [, outerR, pad] = outer;
  assert.ok(Number(pad) >= 3,
    `a ${pad}px rim is too thin to read as a border — the gradient is barely visible`);

  const inner = src.match(/glow-border__inner[^"]*rounded-\[(\d+)px\]/);
  assert.ok(inner, 'expected an explicit inner radius');
  assert.equal(
    Number(outerR) - Number(inner[1]),
    Number(pad),
    'outer radius minus inner radius must equal the padding, or the rim is uneven at the corners',
  );
});

test('the rotating border stops under prefers-reduced-motion', () => {
  const css = cssCode();
  const guards = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
  assert.ok(
    guards.some((g) => g.includes('.glow-border::before') && /animation:\s*none/.test(g)),
    'a continuously spinning border must be stoppable',
  );
});

/**
 * The border is three animated layers, and each has a job:
 *   ::before            the main conic sweep
 *   ::after             a faster, COUNTER-rotating white highlight
 *   .glow-border-wrap   the outer bloom that spills light onto the page
 *
 * The counter-rotation is the point: two sheets turning the same way look like
 * one sheet, so the rim would repeat the same frame every cycle and read as
 * mechanical. And the bloom must live on a separate wrapper, because
 * .glow-border clips its own children — a glow drawn inside is sliced off at
 * the radius instead of spilling.
 */
test('the border layers rotate in opposite directions', () => {
  const css = cssCode();
  assert.match(css, /@keyframes glow-border-spin\b[\s\S]*?rotate:\s*360deg/,
    'the main sweep turns forwards');
  assert.match(css, /@keyframes glow-border-spin-reverse\b[\s\S]*?rotate:\s*-360deg/,
    'the highlight must turn the OTHER way or the two layers move as one');

  const after = css.slice(css.indexOf('.glow-border::after'), css.indexOf('.glow-border__inner'));
  assert.match(after, /glow-border-spin-reverse/, '::after must use the reverse animation');
  assert.match(after, /conic-gradient/, 'the highlight is a conic wedge');
});

test('the outer bloom lives outside the clipping border', () => {
  const css = cssCode();
  // .glow-border clips, so the bloom cannot be one of its children.
  assert.match(css, /\.glow-border \{[^}]*overflow:\s*hidden/,
    'the border clips its spinning sheets to the card radius');
  assert.match(css, /\.glow-border-wrap::before \{[\s\S]*?filter:\s*blur/,
    'the bloom must be a blurred layer on the outer wrapper');

  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  // The wrapper must be an ANCESTOR of the clipping element, not inside it.
  // Match the real elements, not the comment above them: searching for the
  // bare string finds the explanatory prose first and would pass regardless of
  // where the wrapper actually sits.
  const wrapAt = src.search(/className="glow-border-wrap\b/);
  const borderAt = src.search(/className="glow-border rounded-/);
  assert.ok(wrapAt > -1, 'expected a .glow-border-wrap element');
  assert.ok(borderAt > -1, 'expected the .glow-border element');
  assert.ok(wrapAt < borderAt, 'the bloom wrapper must wrap the border, not sit inside it');
  // ...and the two must be distinct elements: putting both classes on one node
  // puts the bloom back inside the clip it is trying to escape.
  assert.ok(
    !/className="[^"]*\bglow-border-wrap\b[^"]*\bglow-border\b/.test(src),
    'the bloom wrapper must be its own element, outside the clipping border',
  );
});

test('every animated border layer stops for reduced motion', () => {
  const css = cssCode();
  const guards = (css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || []).join('\n');
  for (const sel of ['.glow-border::before', '.glow-border::after', '.glow-border-wrap::before']) {
    assert.ok(guards.includes(sel), `${sel} spins continuously and must be stoppable`);
  }
});

test('the main sweep uses uneven stops so it reads as light, not a colour wheel', () => {
  const css = cssCode();
  const before = css.slice(css.indexOf('.glow-border::before'), css.indexOf('.glow-border::after'));
  const stops = [...before.matchAll(/#[0-9A-Fa-f]{6}\s+(\d+)%/g)].map((m) => Number(m[1]));
  assert.ok(stops.length >= 6, 'expected a multi-stop gradient');
  // Evenly spaced stops => every gap identical => flat rainbow. Uneven spacing
  // is what produces the bright comet-and-tail.
  const gaps = stops.slice(1).map((v, i) => v - stops[i]);
  assert.ok(new Set(gaps).size > 1, 'stops must be unevenly spaced');
});

/**
 * The top-right seat counter.
 *
 * It used to appear ONLY once a session was nearly full, so a visitor landing
 * on "30 of 30 seats" saw an empty corner and had no sense that capacity was
 * limited or being tracked. It is now always present for a capped, open
 * session, and TIERED so the styling carries the meaning rather than the copy
 * having to shout.
 *
 * The gating matters as much as the look: an uncapped session has no number to
 * report, and a finished or closed one must never imply seats are still
 * available.
 */
test('the seat counter shows for a capped, open session — not only when nearly full', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  const decl = src.match(/const showSeatCount =([\s\S]*?);/);
  assert.ok(decl, 'expected a showSeatCount flag');
  const cond = decl[1];
  assert.match(cond, /capacity != null/, 'an uncapped session has no count to show');
  assert.match(cond, /seats_left > 0/, 'zero seats is the SOLD OUT state, not a count');
  // Two things it must NOT be gated on, because each emptied the corner on a
  // real meeting:
  //   lowOnSeats    — hid the chip whenever seats were plentiful (30 of 30)
  //   can_register  — the server sets it false once a session is PAST, so the
  //                   corner went blank on the very meeting being viewed, while
  //                   the details rail still reported the same seat numbers.
  assert.ok(
    !/lowOnSeats/.test(cond),
    'the counter must not depend on lowOnSeats or it hides again when seats are plentiful',
  );
  assert.ok(
    !/can_register/.test(cond),
    'the counter must not depend on can_register or it disappears on a past session',
  );
});

test('the counter is tiered: calm when plentiful, urgent only when scarce', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  const start = src.indexOf('showSeatCount ? (');
  const block = src.slice(start, src.indexOf(') : null}', start));
  assert.ok(block, 'expected the seat-counter branch');
  // The pulsing amber treatment is reserved for real scarcity.
  assert.match(block, /lowOnSeats\s*\n?\s*\?\s*"seat-badge bg-amber-500/,
    'only the low-seat tier gets the amber pulse');
  assert.match(block, /bg-background\/80/, 'the plentiful tier is a calm glass chip');
  // The quiet "live" dot must not animate for reduced-motion users.
  assert.match(block, /animate-ping[^"]*motion-reduce:hidden/,
    'the live dot must stop under prefers-reduced-motion');
});

test('sold out replaces the counter rather than stacking with it', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  // A ternary chain guarantees the corner never carries two badges at once.
  assert.match(
    src,
    /\{isSoldOut \? \([\s\S]*?\) : showSeatCount \? \(/,
    'sold-out and the counter must be mutually exclusive branches',
  );
});

test('the corner badge sits above the poster and its backdrop', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  // The poster is z-10; the badge must clear it.
  const badges = [...src.matchAll(/absolute right-4 top-4 z-(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(badges.length >= 2, 'expected the sold-out and seat-count badges');
  for (const z of badges) {
    assert.ok(z >= 20, `a corner badge at z-${z} would sit under the poster (z-10)`);
  }
});

test('a finished session reports seats as a record, not an offer', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  const start = src.indexOf('showSeatCount ? (');
  const block = src.slice(start, src.indexOf(') : null}', start));
  // The past tier must be checked FIRST, otherwise a past-but-low session
  // would render the urgent amber "Only N left" treatment on a session nobody
  // can book any more.
  const order = ['isPast', 'lowOnSeats'].map((k) => block.indexOf(k));
  assert.ok(order[0] > -1 && order[1] > -1, 'expected both the past and low tiers');
  assert.ok(order[0] < order[1], 'the past tier must take precedence over the scarcity tier');
  // No live dot and no flame on a finished session.
  const pastBranch = block.slice(order[0], block.indexOf('lowOnSeats ?', order[0]));
  assert.ok(!/animate-ping/.test(pastBranch), 'a finished session must not pulse a live dot');
  assert.ok(!/Flame/.test(pastBranch), 'a finished session must not show an urgency flame');
});

/**
 * The registration confirmation dialog.
 *
 * It used to end with "We'll email you the joining details before the session."
 * and offer a dashboard route ONLY to a logged-in student. On a public
 * marketing page most registrants are anonymous, so the common case was a
 * confirmation whose only action was Close — the one place the booking actually
 * lives was never offered. The dashboard button is now unconditional.
 */
test('the confirmation routes everyone to their Founder Meetings tab', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  const start = src.indexOf('if (done) {');
  assert.ok(start > -1, 'expected the confirmation branch');
  const confirm = src.slice(start, src.indexOf('const FounderMeetingSection', start));
  assert.ok(confirm, 'expected the confirmation branch');

  assert.ok(
    confirm.includes('navigate("/student/dashboard"') &&
      confirm.includes('tab: "Founder Meetings"'),
    'the button must deep-link to the Founder Meetings tab',
  );

  // The button must NOT be wrapped in an isStudent guard any more.
  assert.ok(
    !/\{isStudent && \(/.test(confirm),
    'gating the dashboard route on isStudent leaves anonymous registrants with no next step',
  );
});

test('the confirmation no longer promises an email instead of an action', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  assert.ok(
    !src.includes("We'll email you the joining details before the session."),
    'that line replaced a real next step with a promise the visitor cannot act on',
  );
});

/**
 * The seat-confirmation wording has to agree everywhere it appears.
 *
 * Three surfaces report the same fact — the registration dialog, the student
 * dashboard's Founder Meetings hero, and its compact cards. Each one used to
 * promise "the joining link will be emailed to you" when `meeting_link` was
 * null. That is a claim the UI cannot stand behind, and on the dashboard it is
 * especially wrong: that screen IS the student's record of the booking, so
 * deferring them to their inbox reads as a brush-off.
 */
test('no surface promises an emailed link in place of confirming the seat', () => {
  const views = [
    PUBLIC_SECTION,
    join(FRONTEND, 'src', 'components', 'student', 'FounderMeetingsView.tsx'),
  ];
  for (const file of views) {
    const src = readFileSync(file, 'utf8');
    // Strip comments: these files explain the old wording in prose.
    const code = src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    assert.ok(
      !/will be emailed to you/.test(code),
      `${file.split(/[\/]/).pop()} still defers the student to their inbox instead of confirming`,
    );
    assert.ok(
      !/We'll email you the joining details/.test(code),
      `${file.split(/[\/]/).pop()} still promises an email instead of a next step`,
    );
  }
});

test('the dashboard confirms the seat when no link is set yet', () => {
  const src = readFileSync(
    join(FRONTEND, 'src', 'components', 'student', 'FounderMeetingsView.tsx'), 'utf8');
  assert.match(src, /Your seat is confirmed\./,
    'a registered student with no link yet still needs a positive confirmation');
  // The genuinely-true line stays: it is attached to a real link.
  assert.match(src, /this link was also emailed to you/,
    'mentioning the email IS correct alongside an actual joining link');
});

/**
 * The card reports each fact once.
 *
 * The details rail carried an AVAILABILITY row ("27 of 30 seats left") while
 * the top-right chip reported the same number a few hundred pixels away, and a
 * pair of trust lines under the CTA restated what the confirmation dialog
 * already says. Both were removed; this keeps them from drifting back.
 */
test('seats are reported once, by the corner chip', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !/>\s*Availability\s*</.test(code),
    'the AVAILABILITY row duplicates the corner seat chip',
  );
  // The chip itself must still be there — removing the row must not remove the
  // only remaining seat count.
  assert.match(code, /showSeatCount/, 'the corner seat chip is the single source of seat info');
});

test('the CTA is not padded with trust microcopy', () => {
  const src = readFileSync(PUBLIC_SECTION, 'utf8');
  for (const phrase of ['Instant confirmation', 'Joining link sent to your email']) {
    assert.ok(!src.includes(phrase), `"${phrase}" was removed from under the Register button`);
  }
});

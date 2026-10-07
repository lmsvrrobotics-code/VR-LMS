/**
 * Guards dashboard dark mode against the failure that keeps recurring here:
 * the dark theme is a hand-written ALLOWLIST of Tailwind utilities in
 * index.css, so any tinted chip, callout or badge added to a dashboard later
 * keeps its LIGHT colours and renders dark-ink-on-light-tint once the student
 * or teacher flips the toggle. That is why the dashboards still showed light
 * patches after switching to dark.
 *
 * This test re-derives the gap from the source on every run. It scans the
 * student and teacher dashboard components for the utility shapes that are
 * unreadable on a dark surface, and asserts index.css repaints each one under
 * a dashboard scope (.dash-dark / .teacher-dark / .admin-dark).
 *
 * It only flags shapes that genuinely break:
 *   - light surfaces   bg-{hue}-50/100/200 and bg-white/NN
 *   - dark ink         text-{hue}-700/800/900, text-black
 *   - light hairlines  border-{hue}-100/200
 * Utilities that are already correct on dark (text-white on a brand button,
 * bg-black/40 scrims, text-emerald-400) are deliberately NOT flagged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

// The three shapes that are unreadable when a light utility lands on a dark
// surface. Written as a literal so the escapes mean what they look like.
const BREAKING =
  /\b(?:bg-(?:white\/\d{1,3}|(?:gray|slate|zinc|neutral|stone|blue|emerald|green|red|orange|amber|yellow|purple|indigo|pink|rose|teal|cyan|sky|violet|lime)-(?:50|100|200))|text-(?:black|(?:gray|slate|zinc|neutral|stone|blue|emerald|green|red|orange|amber|yellow|purple|indigo|pink|rose|teal|cyan|sky|violet|lime)-(?:700|800|900))|border-(?:gray|slate|zinc|neutral|stone|blue|emerald|green|red|orange|amber|yellow|purple|indigo|pink|rose|teal|cyan|sky|violet|lime)-(?:100|200))\b/g;

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|tsx)$/.test(entry)) out.push(p);
  }
  return out;
};

// Does index.css repaint this utility under at least one dashboard dark scope?
// Selectors are matched as plain substrings rather than by regex: a Tailwind
// class like `bg-white/90` is written `.bg-white\/90` in CSS, and building that
// escape inside a regex source string is exactly where this check went wrong
// before. Comparing literal text has no escaping layer to get wrong.
const SCOPES = ['dash-dark', 'teacher-dark', 'admin-dark'];
const isRepainted = (cls) => {
  const cssName = cls.replace('/', '\\/');
  return SCOPES.some((scope) => {
    const needle = `.${scope} .${cssName}`;
    let at = CSS.indexOf(needle);
    while (at !== -1) {
      // Reject a prefix hit: `.dash-dark .bg-red-1` must not satisfy `bg-red-100`.
      const next = CSS[at + needle.length];
      if (next === undefined || !/[\w-]/.test(next)) return true;
      at = CSS.indexOf(needle, at + 1);
    }
    return false;
  });
};

const collect = (matcher) => {
  const used = new Map();
  for (const file of walk(SRC)) {
    if (!matcher(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(BREAKING)) {
      if (!used.has(m[0])) used.set(m[0], new Set());
      used.get(m[0]).add(basename(file));
    }
  }
  return used;
};

const DASHBOARDS = {
  student: (f) => /StudentDashboard/.test(f) || /[\/]pages[\/]student[\/]/.test(f),
  teacher: (f) => /TeacherDashboard/.test(f) || /[\/]pages[\/]teacher[\/]/.test(f),
};

for (const [name, matcher] of Object.entries(DASHBOARDS)) {
  test(`every light utility in the ${name} dashboard is repainted for dark mode`, () => {
    const used = collect(matcher);
    assert.ok(used.size > 0, 'scanner found no utilities — the path matcher is wrong');
    const missing = [...used.entries()]
      .filter(([cls]) => !isRepainted(cls))
      .map(([cls, files]) => `${cls}  (${[...files].sort().join(', ')})`);
    assert.deepEqual(
      missing,
      [],
      `These ${name}-dashboard utilities stay light-mode inside a dark dashboard, so ` +
        `they render unreadable. Add a .dash-dark/.teacher-dark/.admin-dark rule in ` +
        `index.css:\n  ${missing.join('\n  ')}`,
    );
  });
}

test('dark-mode repaints never escape the dashboard scopes', () => {
  // The marketing site must keep its light brand look, so no rule introduced
  // for dark mode may apply without a dashboard hook on an ancestor.
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders = [];
  for (const m of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const body = m[2];
    // Signature colours introduced by the dark status/badge block.
    if (!/rgba\(245, 158, 11, 0\.16\)|rgba\(239, 63, 110, 0\.16\)|rgba\(30, 28, 26, 0\./.test(body)) continue;
    for (const part of m[1].split(',')) {
      const sel = part.trim();
      if (sel && !/\.(dash|teacher|admin)-dark\b/.test(sel)) offenders.push(sel);
    }
  }
  assert.deepEqual(offenders, [], 'dark-mode rules must stay scoped to a dashboard');
});

test('the three dashboards share one persisted theme preference', () => {
  // A per-dashboard toggle would let a student flip to dark and land on a light
  // teacher view; the hook deliberately keeps one module-level store.
  const hook = readFileSync(join(SRC, 'hooks', 'useDashboardTheme.ts'), 'utf8');
  assert.match(hook, /localStorage/, 'the choice must survive a reload');
  assert.match(hook, /useSyncExternalStore/, 'all toggles must read one shared store');
});

test('the breaking-shape detector matches what it claims', () => {
  const hit = (s) => (s.match(BREAKING) || []);
  assert.deepEqual(hit('className="bg-amber-100 text-amber-700"'), ['bg-amber-100', 'text-amber-700']);
  assert.deepEqual(hit('className="border-orange-200"'), ['border-orange-200']);
  assert.deepEqual(hit('className="bg-white/90"'), ['bg-white/90']);
  // Already fine on dark — must not be flagged.
  assert.deepEqual(hit('className="text-white bg-black/40 text-emerald-400"'), []);
});

/**
 * Course content lives on TOP-LEVEL routes, not inside StudentDashboardShell.
 *
 * /courses, /courses/:courseId and the course player are rendered by App.tsx
 * through the public <Layout> (or bare), so they never inherit the `dash-dark`
 * class the dashboard shell applies. That is why a student could switch the
 * dashboard to dark and still land on a white course page and a white player:
 * the toggle was shared and working, but these roots were outside every dark
 * scope. Each must therefore read the theme itself.
 */
const SCOPED_ROUTES = [
  ['pages/CoursePlayer.jsx', 'the course player'],
  ['pages/student/CourseDetails.jsx', 'the course details page'],
  ['pages/student/EnrolledCourses.tsx', 'the enrolled-courses list'],
];

for (const [rel, label] of SCOPED_ROUTES) {
  test(`${label} applies the shared dark scope to its own root`, () => {
    const raw = readFileSync(join(SRC, rel), 'utf8');
    // Strip comments: these files EXPLAIN this bug in prose, and naming
    // `dash-dark` in a comment must not count as applying it.
    const src = raw
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    assert.match(
      src,
      /useDashboardTheme\(\)/,
      `${rel} renders outside StudentDashboardShell, so it must read the shared ` +
        'theme itself or it can never go dark',
    );
    // The hook's value must actually drive a className, not just be read.
    assert.match(
      src,
      /isDark \?[^\n]*dash-dark/,
      `${rel} must apply the dash-dark hook to its root element when isDark`,
    );
  });
}

test('the course player surface has a dark counterpart', () => {
  // .player-shell is a hardcoded light gradient; without an override the player
  // stays light even once the scope is applied.
  // Match the rule that actually repaints the SHELL ITSELF (a background on a
  // selector ending at .player-shell), not merely any descendant rule that
  // happens to mention it — `.dash-dark .player-shell .border-gray-200` would
  // satisfy a looser check while the shell stayed light.
  const repaintsShell = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].some(([, sel, body]) =>
    /background/.test(body) &&
    sel.split(',').some((s) => /\.dash-dark(?:\.|\s+\.)player-shell\s*$/.test(s.trim())),
  );
  assert.ok(repaintsShell, 'index.css must give .player-shell a dark background');
});

test('the lesson modal is covered by the course-details dark theme', () => {
  // Opening a class is the point of the page — a white modal on a dark page is
  // the most jarring version of this bug.
  const css = readFileSync(join(SRC, 'pages', 'student', 'CourseDetails.css'), 'utf8');
  for (const sel of ['.lesson-modal', '.card-menu-pop']) {
    assert.ok(
      css.includes(`.dash-dark ${sel}`),
      `${sel} needs a .dash-dark variant or it stays white on a dark page`,
    );
  }
});

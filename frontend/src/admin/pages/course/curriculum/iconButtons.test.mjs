/**
 * Guards against action buttons that render NOTHING on screen.
 *
 * The Quiz questions modal listed each question with Edit and Delete buttons
 * whose only content was `<span className="fi-rr-pencil" />` — a Flaticon /
 * UIcons webfont class. That font is not loaded anywhere in this project: there
 * is no @font-face, no stylesheet link in index.html, and no package in
 * node_modules providing it (the built CSS contains zero `fi-rr-` rules). An
 * icon-font class with no font is an empty, zero-width span, so both buttons
 * were present and fully clickable but completely invisible — the admin had no
 * way to edit or delete a question.
 *
 * ~90 other `fi-rr-*` usages remain in the app, but every one of those sits
 * NEXT TO a text label ("PDF", "Print", "+ Add"), so those controls are still
 * findable and usable; only the icon is missing. This test therefore does not
 * ban `fi-rr-*` outright — it bans the genuinely broken shape: a <button> whose
 * entire visible content is icon-font spans and nothing else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|tsx)$/.test(entry)) out.push(p);
  }
  return out;
};

// A button is "silent" when stripping icon-font spans leaves no visible content:
// no text, no JSX child, nothing for the user to see or click towards.
const silentIconButtons = (source) => {
  const found = [];
  for (const m of source.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)) {
    const inner = m[1];
    if (!inner.includes('fi-rr-')) continue;
    const rest = inner
      .replace(/<(span|i)[^>]*className="fi-rr-[^"]*"[^>]*\/>/g, '')
      .replace(/\{\/\*.*?\*\/\}/gs, '')
      .trim();
    if (rest === '') found.push(inner.trim());
  }
  return found;
};

test('no button renders only an unloaded icon-font glyph', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    for (const btn of silentIconButtons(readFileSync(file, 'utf8'))) {
      offenders.push(`${file.slice(file.indexOf('src'))}: ${btn}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'These buttons render nothing visible — the fi-rr-* webfont is not loaded in ' +
      'this project, so the span is zero-width. Use react-icons (already a ' +
      'dependency) or add a text label:\n' + offenders.join('\n'),
  );
});

test('the quiz question rows use react-icons, not the missing webfont', () => {
  const src = readFileSync(join(SRC, 'admin/pages/course/curriculum/QuestionList.jsx'), 'utf8');
  // Strip comments first: the file explains the old bug in prose, and naming
  // the dead class must not count as using it.
  const code = src.replace(/\{\/\*.*?\*\/\}/gs, '').replace(/\/\*.*?\*\//gs, '');
  assert.ok(!code.includes('fi-rr-'), 'QuestionList must not depend on the unloaded icon font');
  assert.match(src, /from 'react-icons\/fa'/);
  // Both destructive and non-destructive actions must still be reachable.
  assert.match(src, /aria-label=\{`Edit question/);
  assert.match(src, /aria-label=\{`Delete question/);
});

// The detector must actually catch the shape it claims to catch.
test('the detector flags a silent icon button and spares a labelled one', () => {
  assert.equal(
    silentIconButtons('<button type="button" onClick={x}><span className="fi-rr-pencil" /></button>').length,
    1,
  );
  assert.equal(
    silentIconButtons('<button><i className="fi-rr-print" /> Print</button>').length,
    0,
    'an icon beside a text label is still usable and must not fail the build',
  );
});

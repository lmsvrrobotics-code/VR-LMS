/**
 * The admin's rich-text editor for class descriptions / challenge Instructions.
 *
 * It replaced a raw-HTML textarea: the stored value is rendered through
 * sanitizeHtml() in the player, so an admin previously had to hand-write markup
 * to get a bold word or a list. The editor emits the same plain HTML the column
 * always held, so existing rows keep working untouched.
 *
 * Three properties are easy to break and worth pinning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'RichTextEditor.jsx'), 'utf8');

test('the caret is not reset on every keystroke', () => {
  // Writing innerHTML unconditionally on each render moves the caret to the
  // start, which makes the field impossible to type in.
  assert.match(
    SRC,
    /if \(el && value !== el\.innerHTML\) el\.innerHTML = value/,
    'the DOM may only be written when the incoming value actually differs',
  );
});

test('toolbar buttons do not steal the selection', () => {
  // onClick fires after blur, by which point the selection the command should
  // apply to is gone. onMouseDown + preventDefault keeps it.
  const handlers = SRC.match(/onMouseDown=\{\(e\) => \{ e\.preventDefault\(\);/g) || [];
  assert.ok(handlers.length >= 2, 'every toolbar button must use onMouseDown + preventDefault');
  assert.ok(!/onClick=\{\(\) => exec\(/.test(SRC), 'onClick would blur before the command runs');
});

test('pasted content is flattened to plain text', () => {
  // A paste from Word otherwise carries font tags, inline styles and class
  // names straight into the database.
  assert.match(SRC, /getData\('text\/plain'\)/, 'paste must read plain text');
  assert.match(SRC, /insertText/, 'paste must insert it as text, not HTML');
});

test('inserted links are restricted to http(s)', () => {
  // DOMPurify strips a javascript: href at RENDER time, but rejecting it here
  // keeps the stored value clean too.
  assert.match(SRC, /protocol !== 'http:' && parsed\.protocol !== 'https:'/,
    'a javascript: or data: link must be refused at the source');
});

test('the editor is reachable by assistive tech', () => {
  assert.match(SRC, /role="textbox"/);
  assert.match(SRC, /aria-multiline="true"/);
});

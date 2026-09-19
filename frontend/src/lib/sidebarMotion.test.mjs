// Unit tests for the sidebar rail's label/padding class helpers.
//
// The regression these guard: labels were rendered conditionally
// ({expanded && <span>…</span>}), so on hover the text mounted instantly at
// full opacity while the panel was still widening — a pop that made the whole
// expansion read as a jerk rather than a slide. The fix keeps every label
// mounted and toggles a class that CSS fades, which means the show/hide state
// is now a pure string function and can be tested without a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelClass, labelProps, rowPadClass, railStateClass } from './sidebarMotion.ts';

// --- the label never unmounts ------------------------------------------------

test('a collapsed label still carries the transition class', () => {
  // If .sidebar-label were dropped when collapsed there would be nothing to
  // transition FROM on the way back open.
  const cls = labelClass(false);
  assert.match(cls, /\bsidebar-label\b/);
});

test('expanded and collapsed differ only by the state class', () => {
  assert.match(labelClass(true), /\bis-shown\b/);
  assert.match(labelClass(false), /\bis-hidden\b/);
  assert.ok(!labelClass(true).includes('is-hidden'));
  assert.ok(!labelClass(false).includes('is-shown'));
});

test('layout classes are preserved alongside the state class', () => {
  // Dropping these would collapse the flex row the label sits in.
  const cls = labelClass(true, 'flex-1 text-left whitespace-nowrap');
  assert.match(cls, /flex-1/);
  assert.match(cls, /text-left/);
  assert.match(cls, /whitespace-nowrap/);
  assert.match(cls, /is-shown/);
});

test('no extra classes yields no stray leading space', () => {
  assert.equal(labelClass(true), 'sidebar-label is-shown');
  assert.equal(labelClass(false), 'sidebar-label is-hidden');
});

// --- accessibility -----------------------------------------------------------

test('a collapsed label is hidden from assistive tech', () => {
  // A screen reader must not announce text a sighted user cannot see. CSS
  // visibility:hidden also drops it from the tab order.
  assert.equal(labelProps(false)['aria-hidden'], true);
});

test('an expanded label is exposed to assistive tech', () => {
  assert.equal(labelProps(true)['aria-hidden'], false);
});

test('labelProps carries the same class labelClass produces', () => {
  assert.equal(labelProps(true, 'shrink-0').className, labelClass(true, 'shrink-0'));
});

test('aria-hidden is a boolean, not a string', () => {
  // aria-hidden="false" as a string is a common React footgun; the attribute
  // must be omitted-or-false, never the literal text "false".
  assert.equal(typeof labelProps(true)['aria-hidden'], 'boolean');
});

// --- row padding -------------------------------------------------------------

test('row padding is always animated', () => {
  // Without .sidebar-pad the icons snap to their new x-position partway
  // through the width transition.
  assert.match(rowPadClass(true, 'px-[26px]'), /\bsidebar-pad\b/);
  assert.match(rowPadClass(false, 'px-[26px]'), /\bsidebar-pad\b/);
});

test('the collapsed padding is used only when collapsed', () => {
  assert.match(rowPadClass(false, 'px-[26px]'), /px-\[26px\]/);
  assert.ok(!rowPadClass(true, 'px-[26px]').includes('px-[26px]'));
});

test('the expanded padding defaults to px-6 and can be overridden', () => {
  assert.match(rowPadClass(true, 'px-4'), /\bpx-6\b/);
  assert.match(rowPadClass(true, 'px-4', 'px-5'), /\bpx-5\b/);
});

test('exactly one padding class is emitted per state', () => {
  // Two competing px-* classes would make the result depend on stylesheet
  // order rather than the state.
  for (const expanded of [true, false]) {
    const matches = rowPadClass(expanded, 'px-[26px]').match(/px-[^\s]+/g) ?? [];
    assert.equal(matches.length, 1, `${expanded}: ${matches.join(', ')}`);
  }
});

// --- rail state / collapsed scrollbar ---------------------------------------

test('the collapsed rail is marked so its scrollbar can be suppressed', () => {
  // A scrollbar inside a 76px icon column is unusable and eats the width the
  // icons need; index.css hides it via .sidebar-rail.is-collapsed.
  assert.match(railStateClass(false), /\bis-collapsed\b/);
});

test('the expanded rail is not marked collapsed', () => {
  // Scrolling must come back once the rail opens - the teacher nav has ten
  // items and genuinely overflows shorter viewports.
  assert.ok(!railStateClass(true).includes('is-collapsed'));
});

test('is-collapsed carries no Tailwind responsive prefix', () => {
  // `lg:is-collapsed` would emit NO rule: Tailwind only generates variants for
  // classes it knows about, so the prefix on a hand-written class is inert.
  // Desktop scoping belongs in the stylesheet's media query instead.
  assert.ok(!railStateClass(false).includes('lg:is-collapsed'));
});

test('the collapsed rail is narrow on desktop and full width on mobile', () => {
  // w-64 is the mobile drawer; lg:w-[76px] is the desktop rail.
  const cls = railStateClass(false);
  assert.match(cls, /\bw-64\b/);
  assert.match(cls, /lg:w-\[76px\]/);
});

test('the expanded rail gets a shadow only at desktop width', () => {
  // On mobile it is a drawer over a backdrop, which already separates it.
  assert.match(railStateClass(true), /lg:shadow-2xl/);
});

// --- inert / the hover blink -----------------------------------------------

test('a collapsed label is inert so its contents cannot be focused', () => {
  // Labels are no longer hidden with visibility:hidden (transitioning it
  // caused the hover blink), and opacity alone leaves descendants focusable.
  // One of these wrappers holds the theme-toggle BUTTON, which would
  // otherwise be tabbable while invisible.
  assert.equal(labelProps(false).inert, 'true');
});

test('an expanded label omits inert entirely', () => {
  // Any present value activates inert - inert="false" would disable the very
  // labels that are supposed to be interactive.
  assert.ok(!('inert' in labelProps(true)));
});

test('inert is a string, not a boolean', () => {
  // React 18 does not treat inert as a boolean prop: inert={true} is dropped
  // with a console warning and never reaches the DOM.
  assert.equal(typeof labelProps(false).inert, 'string');
});

test('the expanded label is still exposed and interactive', () => {
  const props = labelProps(true);
  assert.equal(props['aria-hidden'], false);
  assert.equal(props.inert, undefined);
});

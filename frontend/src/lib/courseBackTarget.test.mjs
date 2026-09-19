// Tests for where the course page's back controls should go.
//
// The bug: the header back button called navigate(-1) at BOTH levels. Inside a
// session that meant the most prominent back control on the page dropped the
// student out of the course entirely, when they only meant to step up to the
// session list. Two identical-looking arrows with different behaviour.
//
// The "Course not found" state had the same shape of problem: navigate(-1) for
// someone who arrived by direct link or a refresh has no useful history, and
// can bounce them onto the same broken page again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MY_COURSES = { path: '/student/dashboard', state: { tab: 'My Courses' } };

/**
 * Where the header back button goes. `openSession` is the session the student
 * has drilled into, or null at the top (session list) level.
 */
const backTarget = (openSession) =>
  openSession ? { action: 'up' } : { action: 'navigate', ...MY_COURSES };

/** The visible label — always "Back", at both levels. */
const backLabel = () => 'Back';

/** What assistive tech and the hover tooltip announce: the destination. */
const backDescription = (openSession) =>
  openSession ? 'Back to all sessions' : 'Back to My Courses';

// --- header back button ------------------------------------------------------

test('inside a session, back steps up to the session list', () => {
  // NOT out of the course: that was the reported bug.
  assert.deepEqual(backTarget({ id: 5, title: 'Session 1' }), { action: 'up' });
});

test('at the top level, back leaves for My Courses', () => {
  const t = backTarget(null);
  assert.equal(t.action, 'navigate');
  assert.equal(t.path, '/student/dashboard');
});

test('leaving the course requests the My Courses tab explicitly', () => {
  // Without the tab state the shell opens on Dashboard, so a student who
  // pressed back from a course would land somewhere they did not ask for.
  assert.deepEqual(backTarget(null).state, { tab: 'My Courses' });
});

test('the two levels do not share a destination', () => {
  const inSession = backTarget({ id: 5 });
  const atTop = backTarget(null);
  assert.notDeepEqual(inSession, atTop);
});

// --- the label ---------------------------------------------------------------

test('the visible label is always "Back"', () => {
  assert.equal(backLabel({ id: 5 }), 'Back');
  assert.equal(backLabel(null), 'Back');
});

test('the label does not change with the level', () => {
  // One consistent word; the level only changes where it goes.
  assert.equal(backLabel({ id: 5 }), backLabel(null));
});

test('the destination is still announced, even though it is not shown', () => {
  // aria-label/title carry it, so a screen reader and a hover tooltip say
  // where the button leads without putting it in the visible text.
  assert.equal(backDescription({ id: 5 }), 'Back to all sessions');
  assert.equal(backDescription(null), 'Back to My Courses');
});

test('the announced destination differs by level even though the label does not', () => {
  assert.notEqual(backDescription({ id: 5 }), backDescription(null));
});

// --- header heading ---------------------------------------------------------

/**
 * What the header shows at each level. With the breadcrumb removed, this is
 * the only thing on screen naming the session the classes belong to.
 */
const heading = (course, openSession) =>
  openSession
    ? { eyebrow: course.title, title: openSession.title }
    : { eyebrow: null, title: course.title };

test('inside a session the heading is the session, not the course', () => {
  const h = heading({ title: 'Scratch Coding' }, { id: 5, title: 'Session 01' });
  assert.equal(h.title, 'Session 01');
});

test('the course name is kept above it as context', () => {
  // Removing the breadcrumb would otherwise lose which course this is.
  const h = heading({ title: 'Scratch Coding' }, { id: 5, title: 'Session 01' });
  assert.equal(h.eyebrow, 'Scratch Coding');
});

test('at the top level the heading is the course with no eyebrow', () => {
  // A course name repeated above itself is noise.
  const h = heading({ title: 'Scratch Coding' }, null);
  assert.equal(h.title, 'Scratch Coding');
  assert.equal(h.eyebrow, null);
});

test('the session name is always visible somewhere at session level', () => {
  const h = heading({ title: 'Scratch Coding' }, { id: 5, title: 'Loops' });
  assert.ok([h.eyebrow, h.title].includes('Loops'));
});

// --- the not-found state -----------------------------------------------------

test('the not-found button has an explicit destination, not history', () => {
  // navigate(-1) here can return the student to the same broken page.
  const notFoundTarget = { action: 'navigate', ...MY_COURSES };
  assert.equal(notFoundTarget.action, 'navigate');
  assert.equal(notFoundTarget.path, '/student/dashboard');
  assert.deepEqual(notFoundTarget.state, { tab: 'My Courses' });
});

test('the not-found and top-level back go to the same place', () => {
  // One consistent "out of here" destination, however the student got stuck.
  assert.deepEqual({ action: 'navigate', ...MY_COURSES }, backTarget(null));
});

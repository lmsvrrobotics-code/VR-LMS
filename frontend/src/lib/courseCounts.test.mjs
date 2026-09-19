// Tests for the owned-vs-catalogue split behind the course counts.
//
// The regression: /my-courses was widened to return the whole published
// catalogue (with `locked` on entries the student has not been granted) so the
// My Courses grid could show locked cards. Every OTHER consumer counted the
// rows it got back, so a student with one course out of ten suddenly read
// "10 enrolled courses", an average progress diluted to a tenth, a
// "Continue learning" row full of courses they cannot open, and a leaderboard
// unlocked for someone with no courses at all.
//
// getMyCourses() therefore keeps its original meaning (granted only) and
// getCourseCatalogue() is the opt-in for the one screen that wants everything.
// This file pins the filtering rule those two share.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** The predicate courseApi.getMyCourses applies to the catalogue response. */
const owned = (rows) => rows.filter((c) => !c.locked);

const CATALOGUE = [
  { id: 41, title: 'Scratch', locked: false, progress: 100 },
  { id: 42, title: 'Arduino', locked: true, progress: 0 },
  { id: 43, title: 'Robotics', locked: true, progress: 0 },
  { id: 44, title: 'Python', locked: false, progress: 50 },
];

// --- the filter --------------------------------------------------------------

test('locked courses are excluded from the owned list', () => {
  assert.deepEqual(owned(CATALOGUE).map((c) => c.id), [41, 44]);
});

test('the catalogue itself is left intact', () => {
  // The My Courses grid needs every row, locked ones included.
  assert.equal(CATALOGUE.length, 4);
});

test('a course with no locked field is treated as owned', () => {
  // Defensive: an older response shape, or a payload where the flag was
  // dropped, must not make a real course vanish from the student's list.
  assert.equal(owned([{ id: 1 }]).length, 1);
  assert.equal(owned([{ id: 1, locked: undefined }]).length, 1);
});

test('locked:false is owned and locked:true is not', () => {
  assert.equal(owned([{ id: 1, locked: false }]).length, 1);
  assert.equal(owned([{ id: 1, locked: true }]).length, 0);
});

test('an all-locked catalogue yields no owned courses', () => {
  // This is the case that gates the leaderboard and the empty states.
  const all = owned(CATALOGUE.filter((c) => c.locked));
  assert.deepEqual(all, []);
});

test('an empty response yields an empty list, not a throw', () => {
  assert.deepEqual(owned([]), []);
});

// --- the counts that were wrong ---------------------------------------------

test('the enrolled count reflects granted courses, not the catalogue', () => {
  // The bug: "Enrolled courses" showed 4 for a student who had 2.
  assert.equal(owned(CATALOGUE).length, 2);
  assert.notEqual(owned(CATALOGUE).length, CATALOGUE.length);
});

test('average progress is not diluted by locked courses', () => {
  const avg = (rows) =>
    rows.length ? Math.round(rows.reduce((a, c) => a + (Number(c.progress) || 0), 0) / rows.length) : 0;
  // Over the catalogue the same student reads 38%; over what they own, 75%.
  assert.equal(avg(owned(CATALOGUE)), 75);
  assert.equal(avg(CATALOGUE), 38);
});

test('the locked count is the difference between the two lists', () => {
  // This is what the My Courses subtitle appends as "· N locked".
  assert.equal(CATALOGUE.length - owned(CATALOGUE).length, 2);
});

test('completed and in-progress counts ignore locked courses', () => {
  const mine = owned(CATALOGUE);
  const inProgress = mine.filter((c) => c.progress > 0 && c.progress < 100).length;
  const completed = mine.filter((c) => c.progress >= 100).length;
  assert.equal(inProgress, 1);
  assert.equal(completed, 1);
});

test('a continue-learning slice never surfaces a locked course', () => {
  // Rendering one there would offer a card the student cannot open.
  const firstThree = owned(CATALOGUE).slice(0, 3);
  assert.ok(firstThree.every((c) => !c.locked));
});

// --- the two My Courses sections --------------------------------------------

/** How MyCoursesView splits the catalogue into its two sections. */
const sections = (rows) => ({
  enrolled: rows.filter((c) => !c.locked),
  available: rows.filter((c) => c.locked),
});

test('the two sections partition the catalogue with no overlap', () => {
  // Every course appears exactly once: a card in both sections, or in
  // neither, is a rendering bug the student would notice immediately.
  const { enrolled, available } = sections(CATALOGUE);
  assert.equal(enrolled.length + available.length, CATALOGUE.length);
  const ids = [...enrolled, ...available].map((c) => c.id).sort();
  assert.deepEqual(ids, CATALOGUE.map((c) => c.id).sort());
});

test('the enrolled section holds only unlocked courses', () => {
  assert.ok(sections(CATALOGUE).enrolled.every((c) => !c.locked));
});

test('the available section holds only locked courses', () => {
  assert.ok(sections(CATALOGUE).available.every((c) => c.locked));
});

test('a student with no grants gets an empty enrolled section, not a missing one', () => {
  // The section still renders, explaining WHY it is empty, rather than
  // dropping the student straight into a wall of locked cards.
  const allLocked = CATALOGUE.map((c) => ({ ...c, locked: true }));
  const { enrolled, available } = sections(allLocked);
  assert.deepEqual(enrolled, []);
  assert.equal(available.length, 4);
});

test('a student granted everything gets no available section', () => {
  // Rendering an empty "Available to enrol" implies something is missing.
  const allOwned = CATALOGUE.map((c) => ({ ...c, locked: false }));
  const { enrolled, available } = sections(allOwned);
  assert.equal(enrolled.length, 4);
  assert.deepEqual(available, []);
});

test('section order follows the order the server sent', () => {
  // The API sorts unlocked-first, then by progress, then title. filter()
  // preserves that, so each section stays meaningfully ordered.
  const rows = [
    { id: 1, locked: false, progress: 100, title: 'A' },
    { id: 2, locked: false, progress: 20, title: 'B' },
    { id: 3, locked: true, progress: 0, title: 'C' },
    { id: 4, locked: true, progress: 0, title: 'D' },
  ];
  const { enrolled, available } = sections(rows);
  assert.deepEqual(enrolled.map((c) => c.id), [1, 2]);
  assert.deepEqual(available.map((c) => c.id), [3, 4]);
});

test('an empty catalogue produces two empty sections', () => {
  const { enrolled, available } = sections([]);
  assert.deepEqual(enrolled, []);
  assert.deepEqual(available, []);
});

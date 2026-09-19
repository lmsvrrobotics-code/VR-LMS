// Tests for the /my-courses card payload.
//
// sanitizeCourse is called here WITHOUT sections/lessons (the card doesn't need
// the curriculum), so its own lesson_count is always 0. The per-course totals
// already fetched for the progress maths are what the card must report, so
// these lock down that they reach the payload and stay consistent with the
// percentage they were derived from.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let courseRows = [];
let enrolledRows = [];
let completedCounts = [];
let lessonTotals = [];

const makeCourse = (attrs) => ({
    id: 41,
    title: 'Scratch Coding',
    slug: 'scratch-41',
    status: 'active',
    level: 'beginner',
    teacher_ids: '[]',
    ...attrs,
    toJSON() { const { toJSON, ...rest } = this; return rest; },
});

stub('../src/models', {
    Course: {
        findAll: async () => courseRows,
        findByPk: async () => null,
        findOne: async () => null,
        sequelize: { fn: (...a) => a, col: (c) => c, query: async () => [[], []] },
    },
    Lesson: { findAll: async () => lessonTotals },
    UserProgress: { findAll: async () => enrolledRows },
    LessonWatchProgress: { findAll: async () => [] },
    sequelize: { query: async () => [[], []] },
});
stub('../src/repositories/SectionRepository', { findByCourse: async () => [] });
stub('../src/repositories/LessonRepository', { findBySectionIds: async () => [] });
stub('../src/repositories/CourseRepository', { findById: async () => null });
stub('../src/repositories/QuestionRepository', {});
stub('../src/repositories/QuizSubmissionRepository', {});
stub('../src/config/cache', {
    get: async () => null,
    set: async () => {},
    del: async () => {},
    wrap: async (_k, ttlOrFn, maybeFn) =>
        (typeof maybeFn === 'function' ? maybeFn() : ttlOrFn()),
});
stub('../src/services/RankingService', { build: async () => ({ rows: [], me: null }) });
stub('../src/config/authDatabase', { query: async () => [[], []] });
stub('../src/services/BunnyStream', { signedPlaybackUrl: (u) => u });
stub('../src/services/TeachingAssignmentService', {
    coursesForStudent: async () => [],
    visibleLessonIdsForStudent: async () => ({ enforced: false, rosterScoped: false, lessonIds: new Set() }),
});
stub('../src/course-content/watchStore', {
    completedCountsByCourse: async () => completedCounts,
    get: () => ({}),
    set: () => {},
});

const svcPath = require.resolve('../src/course-content/PublicCourseService');
delete require.cache[svcPath];
const svc = require(svcPath);

const firstCard = async (uid = 'stu-1') => {
    const { courses } = await svc.myCourses(uid);
    return courses[0];
};

beforeEach(() => {
    courseRows = [makeCourse()];
    enrolledRows = [{ course_id: 41 }];
    completedCounts = [];
    lessonTotals = [{ course_id: 41, total: 8 }];
});

// --- class counts -----------------------------------------------------------

test('the card reports the real class total, not sanitizeCourse zero', async () => {
    // sanitizeCourse(c) with no lessons array yields lesson_count 0; the card
    // needs the GROUP BY total instead or it can show no class count at all.
    const card = await firstCard();
    assert.equal(card.lesson_count, 8);
});

test('the card reports how many classes are finished', async () => {
    completedCounts = [{ course_id: 41, count: 3 }];
    const card = await firstCard();
    assert.equal(card.completed_lesson_count, 3);
    assert.equal(card.lesson_count, 8);
});

test('completed count and percentage agree', async () => {
    completedCounts = [{ course_id: 41, count: 4 }];
    const card = await firstCard();
    assert.equal(card.progress, 50, '4 of 8 is 50%');
    assert.equal(card.completed_lesson_count, 4);
});

test('a course with no classes reports zeroes rather than NaN', async () => {
    lessonTotals = [];
    const card = await firstCard();
    assert.equal(card.lesson_count, 0);
    assert.equal(card.completed_lesson_count, 0);
    assert.equal(card.progress, 0);
});

test('an untouched course reports zero completed but keeps its total', async () => {
    const card = await firstCard();
    assert.equal(card.completed_lesson_count, 0);
    assert.equal(card.lesson_count, 8);
    assert.equal(card.progress, 0);
});

test('a fully finished course reads 100% with counts in step', async () => {
    completedCounts = [{ course_id: 41, count: 8 }];
    const card = await firstCard();
    assert.equal(card.progress, 100);
    assert.equal(card.completed_lesson_count, 8);
});

test('a stale completion overshoot is clamped to the total', async () => {
    // A class deleted after a student completed it would otherwise render as
    // "9 of 8 classes" on the card.
    completedCounts = [{ course_id: 41, count: 9 }];
    const card = await firstCard();
    assert.equal(card.completed_lesson_count, 8, 'must not exceed the total');
});

// --- fields the card renders ------------------------------------------------

test('the card carries the level the difficulty meter renders', async () => {
    const card = await firstCard();
    assert.equal(card.level, 'beginner');
});

test('the card carries a certificate flag', async () => {
    const card = await firstCard();
    assert.equal(typeof card.has_certificate, 'boolean');
});

test('the card still carries slug and title for the link and heading', async () => {
    const card = await firstCard();
    assert.equal(card.slug, 'scratch-41');
    assert.equal(card.title, 'Scratch Coding');
});

// --- identity ---------------------------------------------------------------

test('a student with no grants still sees the catalogue, all locked', async () => {
    // My Courses lists every published course so students can see what exists
    // and ask to be enrolled, rather than facing an empty page.
    enrolledRows = [];
    const { courses } = await svc.myCourses('stu-nobody');
    assert.equal(courses.length, 1);
    assert.equal(courses[0].locked, true);
});

test('a blank user id short-circuits to an empty list', async () => {
    const { courses } = await svc.myCourses('   ');
    assert.deepEqual(courses, []);
});

test('a non-numeric student id is not coerced away', async () => {
    // User ids are VARCHAR; Number() would NaN these out of their own courses.
    const card = await firstCard('VR20260701-01');
    assert.equal(card.lesson_count, 8);
});

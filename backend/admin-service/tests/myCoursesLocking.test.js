// Tests for the My Courses catalogue view.
//
// My Courses used to return ONLY the courses a student had been granted, so a
// student with no enrolments saw an empty page and no way to discover what
// existed. It now returns every PUBLISHED course, with `locked` marking the
// ones the student may not open.
//
// The security-relevant part: `locked` is presentational. Access is still
// decided by exactly two grants — an admin enrolment, or a delegation
// (teaching assignment / batch roster). These pin down that widening the LIST
// did not widen ACCESS, and that unpublished courses never leak in.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let courseRows = [];
let enrolledRows = [];
let delegatedIds = [];
let completedCounts = [];
let lessonTotals = [];
let courseQuery = null;

const makeCourse = (attrs) => ({
    id: 41,
    title: 'Scratch Coding',
    slug: 'scratch-41',
    status: 'active',
    is_approved: true,
    level: 'beginner',
    teacher_ids: '[]',
    ...attrs,
    toJSON() { const { toJSON, ...rest } = this; return rest; },
});

stub('../src/models', {
    Course: {
        findAll: async (opts) => { courseQuery = opts; return courseRows; },
        findByPk: async () => null,
        findOne: async () => null,
        sequelize: { fn: (...a) => a, col: (c) => c, query: async () => [[], []] },
    },
    Lesson: { findAll: async () => lessonTotals },
    UserProgress: { findAll: async () => enrolledRows, findOne: async () => null },
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
    coursesForStudent: async () => delegatedIds,
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

const byId = (courses, id) => courses.find((c) => c.id === id);

beforeEach(() => {
    courseRows = [
        makeCourse({ id: 41, title: 'Scratch Coding', slug: 'scratch-41' }),
        makeCourse({ id: 42, title: 'Arduino Basics', slug: 'arduino-42' }),
        makeCourse({ id: 43, title: 'Robotics 101', slug: 'robotics-43' }),
    ];
    enrolledRows = [];
    delegatedIds = [];
    completedCounts = [];
    lessonTotals = [{ course_id: 41, total: 8 }, { course_id: 42, total: 4 }];
    courseQuery = null;
});

// --- the whole catalogue is listed ------------------------------------------

test('every published course is returned, not only the granted ones', async () => {
    const { courses } = await svc.myCourses('stu-1');
    assert.equal(courses.length, 3);
});

test('a student with no grants sees every course locked', async () => {
    const { courses } = await svc.myCourses('stu-nobody');
    assert.equal(courses.length, 3);
    assert.ok(courses.every((c) => c.locked === true));
});

// --- what unlocks ------------------------------------------------------------

test('an enrolled course is unlocked and the rest stay locked', async () => {
    enrolledRows = [{ course_id: 41 }];
    const { courses } = await svc.myCourses('stu-1');
    assert.equal(byId(courses, 41).locked, false);
    assert.equal(byId(courses, 42).locked, true);
    assert.equal(byId(courses, 43).locked, true);
});

test('a batch/teaching delegation unlocks a course', async () => {
    delegatedIds = [42];
    const { courses } = await svc.myCourses('stu-1');
    assert.equal(byId(courses, 42).locked, false);
    assert.equal(byId(courses, 41).locked, true);
});

test('enrolment and delegation together unlock both courses', async () => {
    enrolledRows = [{ course_id: 41 }];
    delegatedIds = [42];
    const { courses } = await svc.myCourses('stu-1');
    assert.equal(byId(courses, 41).locked, false);
    assert.equal(byId(courses, 42).locked, false);
    assert.equal(byId(courses, 43).locked, true);
});

test('a marketing course is never locked', async () => {
    // Free samples are open to every registered student by design.
    courseRows.push(makeCourse({ id: 44, title: 'Free Taster', slug: 'taster-44', is_marketing: true }));
    const { courses } = await svc.myCourses('stu-nobody');
    assert.equal(byId(courses, 44).locked, false);
});

// --- only published courses may appear --------------------------------------

test('the query asks for active, approved courses only', async () => {
    // A draft or unapproved course must not leak into a student view, even as
    // a locked card — the title alone can reveal unreleased work.
    await svc.myCourses('stu-1');
    assert.equal(courseQuery.where.status, 'active');
    assert.equal(courseQuery.where.is_approved, true);
});

// --- locked cards carry no progress -----------------------------------------

test('a locked course reports no progress even if rows exist', async () => {
    // Stale completion rows (from a revoked enrolment) must not render as
    // progress on a course the student can no longer open.
    completedCounts = [{ course_id: 41, count: 4 }];
    const { courses } = await svc.myCourses('stu-nobody');
    const c = byId(courses, 41);
    assert.equal(c.locked, true);
    assert.equal(c.progress, 0);
    assert.equal(c.completed_lesson_count, 0);
});

test('an unlocked course still reports real progress', async () => {
    enrolledRows = [{ course_id: 41 }];
    completedCounts = [{ course_id: 41, count: 4 }];
    const { courses } = await svc.myCourses('stu-1');
    const c = byId(courses, 41);
    assert.equal(c.progress, 50);
    assert.equal(c.completed_lesson_count, 4);
});

test('a locked course still shows its class count', async () => {
    // The count is what makes a locked card informative — it says how much
    // content the student would get.
    const { courses } = await svc.myCourses('stu-nobody');
    assert.equal(byId(courses, 41).lesson_count, 8);
});

// --- ordering ----------------------------------------------------------------

test('unlocked courses sort ahead of locked ones', async () => {
    // The student's own work outranks the catalogue.
    delegatedIds = [43];
    const { courses } = await svc.myCourses('stu-1');
    assert.equal(courses[0].id, 43);
    assert.ok(courses.slice(1).every((c) => c.locked));
});

test('among unlocked courses, more progress sorts first', async () => {
    enrolledRows = [{ course_id: 41 }, { course_id: 42 }];
    completedCounts = [{ course_id: 42, count: 4 }]; // 42 is 100%, 41 is 0%
    const { courses } = await svc.myCourses('stu-1');
    assert.equal(courses[0].id, 42);
});

test('the order is stable for courses that are otherwise equal', async () => {
    // Titles break the tie, so the grid does not reshuffle between loads.
    const first = (await svc.myCourses('stu-1')).courses.map((c) => c.id);
    const second = (await svc.myCourses('stu-1')).courses.map((c) => c.id);
    assert.deepEqual(first, second);
});

// --- identity ----------------------------------------------------------------

test('a blank user id returns nothing rather than the whole catalogue', async () => {
    // An unidentified caller must not be handed a course listing.
    const { courses } = await svc.myCourses('   ');
    assert.deepEqual(courses, []);
});

test('a non-numeric student id still resolves its grants', async () => {
    // User ids are VARCHAR; Number() coercion used to NaN these out.
    enrolledRows = [{ course_id: 41 }];
    const { courses } = await svc.myCourses('VR20260701-01');
    assert.equal(byId(courses, 41).locked, false);
});

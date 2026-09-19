// Tests for the public course payload that feeds the student curriculum card
// grid: sessions carry image/description, classes carry thumbnail/description/
// difficulty, and the details lookup accepts a numeric id as well as a slug.
//
// sanitizeCourse is not exported, so these drive it through detailsBySlug with
// the models/repositories stubbed in the module cache — no DB, no network.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

// --- what the stubbed lookups return / record -------------------------------
let courseRow = null;
let sectionRows = [];
let lessonRows = [];
let lookedUpBy = null; // { kind: 'pk' | 'slug', value }
let watchRows = [];    // lesson_watch_progress rows for the viewing student

const makeCourse = (attrs) => ({
    id: 41,
    title: 'Scratch Coding',
    slug: 'scratch-41',
    status: 'active',
    teacher_ids: '[]',
    ...attrs,
    toJSON() { const { toJSON, ...rest } = this; return rest; },
});

stub('../src/models', {
    Course: {
        findByPk: async (id) => { lookedUpBy = { kind: 'pk', value: id }; return courseRow; },
        findOne: async (opts) => { lookedUpBy = { kind: 'slug', value: opts?.where?.slug }; return courseRow; },
    },
    Lesson: { findAll: async () => [] },
    LessonWatchProgress: { findAll: async () => watchRows },
    sequelize: { query: async () => [[], []] },
});
stub('../src/repositories/SectionRepository', {
    findByCourse: async () => sectionRows,
});
stub('../src/repositories/LessonRepository', {
    findBySectionIds: async () => lessonRows,
});
stub('../src/repositories/CourseRepository', { findById: async () => courseRow });
stub('../src/repositories/QuestionRepository', {});
stub('../src/repositories/QuizSubmissionRepository', {});
// These open real connections (Redis, a second Postgres pool) at require time,
// which would keep the test process alive after the assertions finish.
stub('../src/config/cache', {
    get: async () => null,
    set: async () => {},
    del: async () => {},
    // Real signature is wrap(key, ttl, fn) — call whichever arg is the loader.
    wrap: async (_k, ttlOrFn, maybeFn) =>
        (typeof maybeFn === 'function' ? maybeFn() : ttlOrFn()),
});
// Required lazily inside detailsBySlug for the rank/score block, so it has to
// be stubbed here too or a verifiedUserId run hits the real service.
stub('../src/services/RankingService', {
    build: async () => ({ rows: [], me: null }),
});
stub('../src/config/authDatabase', { query: async () => [[], []] });
stub('../src/services/BunnyStream', { signedPlaybackUrl: (u) => u });
stub('../src/services/TeachingAssignmentService', {
    visibleLessonIdsForStudent: async () => ({ enforced: false, rosterScoped: false, lessonIds: new Set() }),
});
stub('../src/course-content/watchStore', { get: () => ({}), set: () => {} });

const svcPath = require.resolve('../src/course-content/PublicCourseService');
delete require.cache[svcPath];
const svc = require(svcPath);

beforeEach(() => {
    courseRow = makeCourse();
    sectionRows = [];
    lessonRows = [];
    lookedUpBy = null;
    watchRows = [];
});

// --- lookup key -------------------------------------------------------------

test('a numeric key is looked up by primary key, not slug', async () => {
    // The enrolled-student route (/courses/:courseId) only has the id.
    await svc.detailsBySlug('41');
    assert.deepEqual(lookedUpBy, { kind: 'pk', value: 41 });
});

test('a slug key is still looked up by slug', async () => {
    await svc.detailsBySlug('scratch-41');
    assert.deepEqual(lookedUpBy, { kind: 'slug', value: 'scratch-41' });
});

test('a slug that merely starts with digits is not treated as an id', async () => {
    await svc.detailsBySlug('3d-printing-basics');
    assert.deepEqual(lookedUpBy, { kind: 'slug', value: '3d-printing-basics' });
});

test('a missing course returns null so the route can 404', async () => {
    courseRow = null;
    assert.equal(await svc.detailsBySlug('9999'), null);
});

// --- session payload --------------------------------------------------------

test('sessions expose their cover image and description', async () => {
    sectionRows = [{ id: 5, title: 'Session 01', sort: 1, image: 'r2/cover.png', description: 'Intro to Scratch' }];
    const { course } = await svc.detailsBySlug('41');
    const s = course.sections[0];
    assert.equal(s.title, 'Session 01');
    assert.equal(s.image, 'r2/cover.png');
    assert.equal(s.description, 'Intro to Scratch');
});

test('a session with no image or description yields empty strings, not undefined', async () => {
    // The card checks truthiness to decide between art and a fallback icon.
    sectionRows = [{ id: 5, title: 'Session 01', sort: 1, image: null, description: null }];
    const { course } = await svc.detailsBySlug('41');
    assert.equal(course.sections[0].image, '');
    assert.equal(course.sections[0].description, '');
});

// --- class payload ----------------------------------------------------------

test('classes expose thumbnail, description and difficulty', async () => {
    sectionRows = [{ id: 5, title: 'Session 01', sort: 1 }];
    lessonRows = [{
        id: 86, section_id: 5, title: 'Motion blocks', duration: '00:10:00',
        lesson_type: 'video-url', is_free: 0,
        thumbnail: 'r2/class.png', description: 'Learn motion', difficulty: 'easy',
    }];
    const { course } = await svc.detailsBySlug('41');
    const l = course.sections[0].lessons[0];
    assert.equal(l.thumbnail, 'r2/class.png');
    assert.equal(l.description, 'Learn motion');
    assert.equal(l.difficulty, 'easy');
    assert.equal(l.duration, '00:10:00');
});

test('a class with no difficulty yields an empty string so no pill renders', async () => {
    sectionRows = [{ id: 5, title: 'S', sort: 1 }];
    lessonRows = [{ id: 86, section_id: 5, title: 'C', difficulty: null, thumbnail: null, description: null }];
    const { course } = await svc.detailsBySlug('41');
    const l = course.sections[0].lessons[0];
    assert.equal(l.difficulty, '');
    assert.equal(l.thumbnail, '');
    assert.equal(l.description, '');
});

test('classes are grouped under their own session', async () => {
    sectionRows = [
        { id: 5, title: 'Session 01', sort: 1 },
        { id: 6, title: 'Session 02', sort: 2 },
    ];
    lessonRows = [
        { id: 80, section_id: 5, title: 'A' },
        { id: 81, section_id: 6, title: 'B' },
        { id: 82, section_id: 5, title: 'C' },
    ];
    const { course } = await svc.detailsBySlug('41');
    assert.deepEqual(course.sections[0].lessons.map((l) => l.title), ['A', 'C']);
    assert.deepEqual(course.sections[1].lessons.map((l) => l.title), ['B']);
});

test('section_count and lesson_count back the overview stat tiles', async () => {
    sectionRows = [{ id: 5, title: 'S1', sort: 1 }, { id: 6, title: 'S2', sort: 2 }];
    lessonRows = [{ id: 80, section_id: 5 }, { id: 81, section_id: 6 }, { id: 82, section_id: 5 }];
    const { course } = await svc.detailsBySlug('41');
    assert.equal(course.section_count, 2);
    assert.equal(course.lesson_count, 3);
});

test('a course with no sessions yields an empty array, not undefined', async () => {
    // The curriculum tab maps over this directly.
    const { course } = await svc.detailsBySlug('41');
    assert.deepEqual(course.sections, []);
    assert.equal(course.section_count, 0);
});

// --- last opened ------------------------------------------------------------

test('an anonymous viewer gets no last-opened stamps', async () => {
    sectionRows = [{ id: 5, title: 'S', sort: 1 }];
    lessonRows = [{ id: 80, section_id: 5, title: 'A' }];
    watchRows = [{ lesson_id: 80, updated_at: '2026-09-01T10:00:00Z' }];
    const { course } = await svc.detailsBySlug('41'); // no verifiedUserId
    assert.equal(course.sections[0].last_opened_at, undefined);
    assert.equal(course.sections[0].lessons[0].last_opened_at, undefined);
});

test('a class carries its own last-opened stamp', async () => {
    sectionRows = [{ id: 5, title: 'S', sort: 1 }];
    lessonRows = [{ id: 80, section_id: 5, title: 'A' }];
    watchRows = [{ lesson_id: 80, updated_at: '2026-09-01T10:00:00Z' }];
    const { course } = await svc.detailsBySlug('41', null, 'stu-1');
    assert.equal(course.sections[0].lessons[0].last_opened_at, '2026-09-01T10:00:00Z');
});

test('a never-opened class gets null, not a missing key', async () => {
    sectionRows = [{ id: 5, title: 'S', sort: 1 }];
    lessonRows = [{ id: 80, section_id: 5, title: 'A' }];
    const { course } = await svc.detailsBySlug('41', null, 'stu-1');
    assert.equal(course.sections[0].lessons[0].last_opened_at, null);
    assert.equal(course.sections[0].last_opened_at, null);
});

test('a session rolls up to its most recently opened class', async () => {
    sectionRows = [{ id: 5, title: 'S', sort: 1 }];
    lessonRows = [
        { id: 80, section_id: 5, title: 'A' },
        { id: 81, section_id: 5, title: 'B' },
        { id: 82, section_id: 5, title: 'C' },
    ];
    watchRows = [
        { lesson_id: 80, updated_at: '2026-08-30T10:00:00Z' },
        { lesson_id: 81, updated_at: '2026-09-02T10:00:00Z' }, // newest
        { lesson_id: 82, updated_at: '2026-08-31T10:00:00Z' },
    ];
    const { course } = await svc.detailsBySlug('41', null, 'stu-1');
    assert.equal(course.sections[0].last_opened_at, '2026-09-02T10:00:00Z');
});

test('a session with only some classes opened still rolls up', async () => {
    sectionRows = [{ id: 5, title: 'S', sort: 1 }];
    lessonRows = [{ id: 80, section_id: 5 }, { id: 81, section_id: 5 }];
    watchRows = [{ lesson_id: 81, updated_at: '2026-09-02T10:00:00Z' }];
    const { course } = await svc.detailsBySlug('41', null, 'stu-1');
    assert.equal(course.sections[0].lessons[0].last_opened_at, null);
    assert.equal(course.sections[0].last_opened_at, '2026-09-02T10:00:00Z');
});

test('each session rolls up only its own classes', async () => {
    sectionRows = [{ id: 5, title: 'S1', sort: 1 }, { id: 6, title: 'S2', sort: 2 }];
    lessonRows = [{ id: 80, section_id: 5 }, { id: 81, section_id: 6 }];
    watchRows = [
        { lesson_id: 80, updated_at: '2026-08-01T10:00:00Z' },
        { lesson_id: 81, updated_at: '2026-09-02T10:00:00Z' },
    ];
    const { course } = await svc.detailsBySlug('41', null, 'stu-1');
    assert.equal(course.sections[0].last_opened_at, '2026-08-01T10:00:00Z');
    assert.equal(course.sections[1].last_opened_at, '2026-09-02T10:00:00Z');
});

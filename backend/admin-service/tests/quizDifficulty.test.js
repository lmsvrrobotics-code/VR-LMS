// Quizzes are `lessons` rows, so they carry the same `difficulty` column the
// content classes use. These cover the quiz create/update paths validating and
// persisting it through the shared normaliser.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let created = null;
let updated = null;
let existingQuiz = null;
let duplicate = null;

stub('../src/repositories/LessonRepository', {
    findOne: async () => duplicate,
    findById: async () => existingQuiz,
    findLastSortInCourse: async () => ({ sort: 2 }),
    create: async (d) => { created = d; return d; },
});
stub('../src/repositories/QuestionRepository', { findByQuiz: async () => [] });
stub('../src/repositories/QuizSubmissionRepository', {});

const svcPath = require.resolve('../src/services/QuizService');
delete require.cache[svcPath];
const svc = require(svcPath);

const validBody = (over = {}) => ({
    course_id: 41, title: 'Concept Test', section: 5,
    total_mark: 10, pass_mark: 5, retake: 1,
    hour: 0, minute: 10, second: 0,
    ...over,
});

beforeEach(() => {
    created = null;
    updated = null;
    duplicate = null;
    existingQuiz = {
        id: 87, course_id: 41,
        update: async (patch) => { updated = patch; return patch; },
    };
});

// --- create -----------------------------------------------------------------

test('a quiz stores its difficulty', async () => {
    await svc.createQuiz(validBody({ difficulty: 'hard' }));
    assert.equal(created.difficulty, 'hard');
    assert.equal(created.lesson_type, 'quiz');
});

test('quiz difficulty is normalised the same way class difficulty is', async () => {
    await svc.createQuiz(validBody({ difficulty: '  Medium  ' }));
    assert.equal(created.difficulty, 'medium');
});

test('an unspecified quiz difficulty is stored as null', async () => {
    await svc.createQuiz(validBody({ difficulty: '' }));
    assert.equal(created.difficulty, null);
});

test('an omitted difficulty is also null, not undefined', async () => {
    await svc.createQuiz(validBody());
    assert.equal(created.difficulty, null);
});

test('an invalid quiz difficulty is rejected before the row is written', async () => {
    await assert.rejects(
        () => svc.createQuiz(validBody({ difficulty: 'extreme' })),
        /Difficulty must be one of/,
    );
    assert.equal(created, null, 'nothing may be persisted on a rejected save');
});

// --- update -----------------------------------------------------------------

test('updating a quiz persists the new difficulty', async () => {
    await svc.updateQuiz(87, validBody({ difficulty: 'easy' }));
    assert.equal(updated.difficulty, 'easy');
});

test('clearing a quiz difficulty writes null', async () => {
    await svc.updateQuiz(87, validBody({ difficulty: '' }));
    assert.equal(updated.difficulty, null);
});

test('an invalid difficulty on update is rejected and nothing is written', async () => {
    await assert.rejects(
        () => svc.updateQuiz(87, validBody({ difficulty: 'nightmare' })),
        /Difficulty must be one of/,
    );
    assert.equal(updated, null);
});

test('the existing quiz fields still round-trip alongside difficulty', async () => {
    // Guards against the difficulty patch clobbering the rest of the update.
    await svc.updateQuiz(87, validBody({ difficulty: 'hard', title: 'Renamed' }));
    assert.equal(updated.title, 'Renamed');
    assert.equal(updated.total_mark, 10);
    assert.equal(updated.pass_mark, 5);
    assert.equal(updated.difficulty, 'hard');
});

// What the student's quiz actually receives, and what the admin's multipart
// form actually sends.
//
// Two halves of the same feature:
//   1. PublicCourseService.normalizeQuizQuestion — the per-question image/video
//      has to survive the trip to the player for EVERY question type, or the
//      teacher uploads a circuit photo and students see a bare question.
//   2. QuizService.parseMultipartArrays — the admin form turned multipart when
//      upload arrived, and FormData cannot carry an array, so options/answer
//      come back as JSON strings. Left unparsed, "mcq needs options" rejects a
//      question that plainly has them.
//
// The real modules are loaded with their DB-touching dependencies stubbed, so
// this runs with no Postgres, R2 or Bunny. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

// Every module below only needs to EXIST for the require graph to resolve —
// none of the code under test calls into them.
stub('../src/models', {});
stub('../src/config/database', { query: async () => [] });
stub('../src/config/authDatabase', { query: async () => [] });
stub('../src/config/cache', { get: async () => null, set: async () => null, del: async () => null });
stub('../src/repositories/CourseRepository', {});
stub('../src/repositories/SectionRepository', {});
stub('../src/repositories/LessonRepository', {});
stub('../src/repositories/QuestionRepository', {});
stub('../src/repositories/QuizSubmissionRepository', {});
stub('../src/repositories/UserRepository', {});
stub('../src/course-content/watchStore', {});
stub('../src/services/TeachingAssignmentService', {});
stub('../src/services/BunnyStream', {});
stub('../src/services/R2Storage', {});
stub('../src/helpers/fileUploader', {
    upload: async () => 'https://cdn.example/stub',
    removeFile: async () => undefined,
    niceFileName: (t, e) => `${t}.${e}`,
});

const { normalizeQuizQuestion } = require('../src/course-content/PublicCourseService');
const { parseMultipartArrays } = require('../src/services/QuizService');

const IMAGE = 'https://cdn.example/quizzes/46/questions/image-1.png';
const VIDEO = 'https://iframe.mediadelivery.net/embed/123/abc-def';

// --- media reaches the player, whatever the question type --------------------

test('an mcq question carries its image and video to the player', () => {
    const out = normalizeQuizQuestion({
        id: 7,
        title: 'Which component is circled?',
        type: 'mcq',
        options: JSON.stringify(['Resistor', 'Capacitor']),
        answer: JSON.stringify(['Resistor']),
        image: IMAGE,
        video: VIDEO,
    });
    assert.equal(out.image, IMAGE);
    assert.equal(out.video, VIDEO);
    // The existing contract must be untouched: answer is the option INDEX.
    assert.equal(out.q, 'Which component is circled?');
    assert.deepEqual(out.options, ['Resistor', 'Capacitor']);
    assert.equal(out.answer, 0);
});

test('a true/false question carries its media too', () => {
    const out = normalizeQuizQuestion({
        id: 8, title: 'Is this a servo?', type: 'true_false', answer: 'true', image: IMAGE,
    });
    assert.equal(out.image, IMAGE);
    assert.deepEqual(out.options, ['True', 'False']);
    assert.equal(out.answer, 0);
});

test('a fill-in-the-blanks question carries its media too', () => {
    const out = normalizeQuizQuestion({
        id: 9,
        title: 'Name the part shown',
        type: 'fill_blanks',
        answer: JSON.stringify(['Servo']),
        video: VIDEO,
    });
    assert.equal(out.video, VIDEO);
    assert.deepEqual(out.answer, ['servo']);
});

// A question with only one of the two must not advertise the other — the
// player renders a slot for any key that is present.
test('only the media that exists is sent', () => {
    const imgOnly = normalizeQuizQuestion({
        id: 10, title: 'Q', type: 'mcq', options: '["a"]', answer: '["a"]', image: IMAGE,
    });
    assert.equal(imgOnly.image, IMAGE);
    assert.equal('video' in imgOnly, false);

    const vidOnly = normalizeQuizQuestion({
        id: 11, title: 'Q', type: 'mcq', options: '["a"]', answer: '["a"]', video: VIDEO,
    });
    assert.equal(vidOnly.video, VIDEO);
    assert.equal('image' in vidOnly, false);
});

// Every question written before this feature has NULL in both columns; their
// payload must be byte-for-byte what it was.
test('a text-only question gains no media keys', () => {
    const out = normalizeQuizQuestion({
        id: 12, title: 'Plain question', type: 'mcq',
        options: JSON.stringify(['a', 'b']), answer: JSON.stringify(['b']),
        image: null, video: null,
    });
    assert.deepEqual(Object.keys(out).sort(), ['answer', 'id', 'options', 'q', 'type']);
});

// Sequelize hands these in as model instances, not plain objects.
test('reads media off a Sequelize row via toJSON', () => {
    const row = {
        toJSON: () => ({
            id: 13, title: 'Q', type: 'mcq',
            options: JSON.stringify(['a']), answer: JSON.stringify(['a']),
            image: IMAGE,
        }),
    };
    assert.equal(normalizeQuizQuestion(row).image, IMAGE);
});

// --- the multipart body the admin form posts --------------------------------

test('JSON-string options and answer are parsed back into arrays', () => {
    const out = parseMultipartArrays({
        quiz_id: '46',
        title: 'Which one?',
        type: 'mcq',
        options: JSON.stringify(['Left', 'Right']),
        answer: JSON.stringify(['Left']),
    });
    assert.deepEqual(out.options, ['Left', 'Right']);
    assert.deepEqual(out.answer, ['Left']);
});

// true_false posts a bare "true"; turning that into something else would break
// the stored answer.
test('a plain string answer is left exactly as it arrived', () => {
    const out = parseMultipartArrays({ title: 'Q', type: 'true_false', answer: 'true' });
    assert.equal(out.answer, 'true');
});

test('native arrays from a JSON client pass through untouched', () => {
    const out = parseMultipartArrays({
        title: 'Q', type: 'mcq', options: ['a', 'b'], answer: ['a'],
    });
    assert.deepEqual(out.options, ['a', 'b']);
    assert.deepEqual(out.answer, ['a']);
});

// Malformed JSON must not throw — the per-type rules downstream produce the
// real, readable error instead of a 500.
test('a malformed array string is left alone rather than throwing', () => {
    const out = parseMultipartArrays({ title: 'Q', type: 'mcq', options: '[not json' });
    assert.equal(out.options, '[not json');
});

test('parsing does not mutate the caller body', () => {
    const body = { title: 'Q', type: 'mcq', options: JSON.stringify(['a']) };
    const out = parseMultipartArrays(body);
    assert.equal(body.options, '["a"]', 'the original body must be untouched');
    assert.deepEqual(out.options, ['a']);
});

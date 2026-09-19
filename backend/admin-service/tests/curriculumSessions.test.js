// Tests for the session (section) service paths: image upload/replacement,
// the legacy `up_title` key, and difficulty validation reaching the lesson
// builder. The repositories, R2 uploader and Bunny client are stubbed in the
// module cache so nothing touches a DB or the network.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
    return resolved;
};

// --- state the stubs record -------------------------------------------------
let created = null;
let uploaded = [];
let removed = [];
let sectionRow = null;

const makeRow = (attrs) => ({
    ...attrs,
    update(patch) { Object.assign(this, patch); return this; },
    destroy() { this.destroyed = true; },
});

stub('../src/repositories/SectionRepository', {
    findByCourse: async () => [],
    findById: async () => sectionRow,
    findLastSort: async () => ({ sort: 3 }),
    create: async (data) => { created = data; return makeRow(data); },
    updateSort: async () => {},
});
stub('../src/repositories/LessonRepository', {
    findBySectionIds: async () => [],
    findById: async () => null,
    findLastSortInCourse: async () => ({ sort: 0 }),
    create: async (d) => d,
});
stub('../src/repositories/QuestionRepository', {});
stub('../src/repositories/QuizSubmissionRepository', {});
stub('../src/repositories/CourseRepository', { findById: async () => null });
stub('../src/helpers/fileUploader', {
    upload: async (file, dest) => { uploaded.push({ name: file.originalname, dest }); return dest; },
    removeFile: async (key) => { removed.push(key); },
});
stub('../src/services/BunnyStream', {
    createCollection: async () => null,
    uploadVideoForTitle: async () => ({ hlsUrl: '' }),
    importVideoFromUrl: async () => ({ hlsUrl: '' }),
    isExternalImportableUrl: () => false,
});

const svcPath = require.resolve('../src/services/CurriculumService');
delete require.cache[svcPath];
const svc = require(svcPath);

const imageFile = (name = 'cover.png') => ({ originalname: name, path: `tmp/${name}` });

beforeEach(() => { created = null; uploaded = []; removed = []; sectionRow = null; });

// --- createSection ----------------------------------------------------------

test('createSection stores name, description and appends after the last sort', async () => {
    const r = await svc.createSection({
        body: { course_id: 9, title: ' Session One ', description: ' Intro ' },
        files: {},
    });
    assert.equal(created.title, 'Session One');
    assert.equal(created.description, 'Intro');
    assert.equal(created.course_id, 9);
    assert.equal(created.sort, 4, 'new session goes after the existing last sort');
    assert.match(r.message, /Session added/);
});

test('createSection uploads the cover image under the course folder', async () => {
    await svc.createSection({
        body: { course_id: 9, title: 'S1' },
        files: { image: [imageFile('cover.png')] },
    });
    assert.equal(uploaded.length, 1);
    assert.match(uploaded[0].dest, /^uploads\/courses\/9\/sessions\//);
    assert.match(uploaded[0].dest, /\.png$/);
    assert.equal(created.image, uploaded[0].dest);
});

test('createSection without an image leaves image unset', async () => {
    await svc.createSection({ body: { course_id: 9, title: 'S1' }, files: {} });
    assert.equal(uploaded.length, 0);
    assert.equal(created.image, undefined);
});

test('createSection rejects a blank name', async () => {
    await assert.rejects(
        () => svc.createSection({ body: { course_id: 9, title: '   ' }, files: {} }),
        /Title is required/,
    );
});

test('createSection requires a course id', async () => {
    await assert.rejects(
        () => svc.createSection({ body: { title: 'S1' }, files: {} }),
        /course_id is required/,
    );
});

// --- updateSection ----------------------------------------------------------

test('updateSection accepts the legacy up_title key from an old client', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, title: 'Old', image: null });
    await svc.updateSection({ body: { section_id: 2, up_title: 'New name' }, files: {} });
    assert.equal(sectionRow.title, 'New name');
});

test('updateSection leaves the title alone when only the description is sent', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, title: 'Keep me', image: null });
    await svc.updateSection({ body: { section_id: 2, description: 'New blurb' }, files: {} });
    assert.equal(sectionRow.title, 'Keep me', 'a partial edit must not blank the title');
    assert.equal(sectionRow.description, 'New blurb');
});

test('updateSection replacing the image removes the previous file', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, title: 'S', image: 'uploads/courses/9/sessions/old.png' });
    await svc.updateSection({
        body: { section_id: 2 },
        files: { image: [imageFile('new.png')] },
    });
    assert.deepEqual(removed, ['uploads/courses/9/sessions/old.png']);
    // The stored name is generated (timestamp + token), so only the folder and
    // extension are predictable — what matters is that it is a NEW key.
    assert.match(sectionRow.image, /^uploads\/courses\/9\/sessions\/.*\.png$/);
    assert.notEqual(sectionRow.image, 'uploads/courses/9/sessions/old.png');
});

test('updateSection honours an explicit image removal', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, title: 'S', image: 'uploads/courses/9/sessions/old.png' });
    await svc.updateSection({ body: { section_id: 2, remove_image: '1' }, files: {} });
    assert.deepEqual(removed, ['uploads/courses/9/sessions/old.png']);
    assert.equal(sectionRow.image, null);
});

test('updateSection keeps the image when neither a file nor a removal is sent', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, title: 'S', image: 'uploads/courses/9/sessions/keep.png' });
    await svc.updateSection({ body: { section_id: 2, title: 'Renamed' }, files: {} });
    assert.deepEqual(removed, []);
    assert.equal(sectionRow.image, 'uploads/courses/9/sessions/keep.png');
});

test('updateSection 404s on a missing session', async () => {
    sectionRow = null;
    await assert.rejects(
        () => svc.updateSection({ body: { section_id: 404 }, files: {} }),
        /Session not found/,
    );
});

// --- deleteSection ----------------------------------------------------------

test('deleteSection sweeps the cover image', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, image: 'uploads/courses/9/sessions/c.png' });
    await svc.deleteSection(2);
    assert.deepEqual(removed, ['uploads/courses/9/sessions/c.png']);
    assert.equal(sectionRow.destroyed, true);
});

test('deleteSection works when there is no image', async () => {
    sectionRow = makeRow({ id: 2, course_id: 9, image: null });
    await svc.deleteSection(2);
    assert.deepEqual(removed, []);
    assert.equal(sectionRow.destroyed, true);
});

// --- createLesson (class) ---------------------------------------------------

test('createLesson stores description, difficulty and the class image', async () => {
    const r = await svc.createLesson({
        body: {
            course_id: 9, section_id: 2, title: 'Class 1',
            lesson_type: 'text', lesson_provider: 'text',
            text_description: 'body', description: ' What we cover ', difficulty: 'Medium',
        },
        files: { thumbnail: [imageFile('class.jpg')] },
    });
    assert.equal(r.lesson.description, 'What we cover');
    assert.equal(r.lesson.difficulty, 'medium', 'difficulty is normalised to lowercase');
    assert.match(r.lesson.thumbnail, /^uploads\/courses\/9\/lessons\/.*\.jpg$/);
});

test('createLesson rejects an invalid difficulty before touching storage', async () => {
    await assert.rejects(
        () => svc.createLesson({
            body: {
                course_id: 9, section_id: 2, title: 'Class 1',
                lesson_type: 'text', lesson_provider: 'text', difficulty: 'extreme',
            },
            files: {},
        }),
        /Difficulty must be one of/,
    );
    assert.equal(uploaded.length, 0, 'nothing should be uploaded on a rejected save');
});

test('createLesson leaves difficulty null when unspecified', async () => {
    const r = await svc.createLesson({
        body: {
            course_id: 9, section_id: 2, title: 'Class 1',
            lesson_type: 'text', lesson_provider: 'text', difficulty: '',
        },
        files: {},
    });
    assert.equal(r.lesson.difficulty, null);
});

test('createLesson keeps the class image distinct from an image lesson attachment', async () => {
    // For an image-type lesson the attachment IS the content; the thumbnail is
    // separate card art. Both must land, in different fields.
    const r = await svc.createLesson({
        body: {
            course_id: 9, section_id: 2, title: 'Poster',
            lesson_type: 'image', lesson_provider: 'image',
        },
        files: { attachment: [imageFile('content.png')], thumbnail: [imageFile('card.jpg')] },
    });
    // Both are uploaded under the course's lesson folder with generated names,
    // so identity is checked by extension and by the two keys differing.
    assert.match(r.lesson.attachment, /^uploads\/courses\/9\/lessons\/.*\.png$/);
    assert.match(r.lesson.thumbnail, /^uploads\/courses\/9\/lessons\/.*\.jpg$/);
    assert.notEqual(r.lesson.attachment, r.lesson.thumbnail);
    assert.equal(uploaded.length, 2, 'content and card art upload separately');
});

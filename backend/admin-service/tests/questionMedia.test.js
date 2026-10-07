// Per-question quiz media: image and/or video attached to a single question.
//
// The feature teachers asked for is "ask about this picture / this clip", not
// text-only questions. These cover the decisions that are easy to get wrong and
// silent when they are: which slot a picked file belongs to, whether an edit
// replaces or clears the stored file, and the multipart encoding the admin form
// is forced into (FormData has no array type, so options/answer arrive as JSON
// strings and the checkbox flags arrive as "1"/"true"/"0").
//
// Pure — no DB, no R2, no Bunny. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    questionFolder, pickFile, isImageFile, isVideoFile, isTruthyFlag, planMediaSlot,
} = require('../src/lib/questionMedia');
const { schemas } = require('../src/lib/validators');

const file = (mimetype, originalname = 'x.bin') => ({ mimetype, originalname });

// --- file-type recognition ---------------------------------------------------

test('recognises the common image types by MIME', () => {
    for (const m of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']) {
        assert.equal(isImageFile(file(m, 'diagram')), true, `${m} must count as an image`);
        assert.equal(isVideoFile(file(m, 'diagram')), false, `${m} must not count as a video`);
    }
});

test('recognises the common video types by MIME', () => {
    for (const m of ['video/mp4', 'video/webm', 'video/quicktime']) {
        assert.equal(isVideoFile(file(m, 'clip')), true, `${m} must count as a video`);
        assert.equal(isImageFile(file(m, 'clip')), false, `${m} must not count as an image`);
    }
});

// Windows reports application/octet-stream for a file whose extension has no
// registered association — the same trap that once blocked teachers from
// attaching PDFs to assignments.
test('falls back to the extension when the browser sends octet-stream', () => {
    assert.equal(isImageFile(file('application/octet-stream', 'circuit.PNG')), true);
    assert.equal(isVideoFile(file('application/octet-stream', 'robot-arm.mp4')), true);
});

test('rejects a file that is neither picture nor clip', () => {
    assert.equal(isImageFile(file('application/pdf', 'notes.pdf')), false);
    assert.equal(isVideoFile(file('application/pdf', 'notes.pdf')), false);
});

test('treats a missing file as neither type rather than throwing', () => {
    for (const empty of [null, undefined]) {
        assert.equal(isImageFile(empty), false);
        assert.equal(isVideoFile(empty), false);
    }
});

// A video dropped into the image picker must not be silently resized as a
// picture — the service refuses it on this check.
test('a video in the image slot is not accepted as an image', () => {
    assert.equal(isImageFile(file('video/mp4', 'clip.mp4')), false);
});

// --- multer plumbing ---------------------------------------------------------

test('pickFile pulls the first file of a named multer field', () => {
    const img = file('image/png', 'a.png');
    const files = { image: [img], video: [file('video/mp4', 'b.mp4')] };
    assert.equal(pickFile(files, 'image'), img);
});

test('pickFile returns null when the field or req.files is absent', () => {
    assert.equal(pickFile(undefined, 'image'), null);
    assert.equal(pickFile({}, 'image'), null);
    assert.equal(pickFile({ image: [] }, 'image'), null);
});

test('question assets are keyed per quiz so a quiz owns one folder', () => {
    assert.equal(questionFolder(46), 'uploads/quizzes/46/questions');
});

// --- the "remove this media" checkbox ---------------------------------------
// Multipart turns every scalar into a string, so a false checkbox can arrive
// as the literal "false" or "0". Reading those as truthy would delete the very
// media the admin just chose to keep.

test('truthy flags: the shapes a checked box actually arrives as', () => {
    for (const v of [true, '1', 'true', 'on', 'yes']) {
        assert.equal(isTruthyFlag(v), true, `${JSON.stringify(v)} must read as checked`);
    }
});

test('falsy flags: unchecked, absent, and the string "false"/"0"', () => {
    for (const v of [false, '0', 'false', 'off', '', '  ', null, undefined, 'null', 'undefined']) {
        assert.equal(isTruthyFlag(v), false, `${JSON.stringify(v)} must read as unchecked`);
    }
});

// --- what happens to each media slot on save ---------------------------------

test('a picked file replaces whatever was stored', () => {
    const f = file('image/png', 'new.png');
    const plan = planMediaSlot({ file: f, removeFlag: undefined, current: 'https://cdn/old.png' });
    assert.deepEqual(plan, { action: 'replace', file: f });
});

test('a picked file on a question with no media is still a replace', () => {
    const f = file('image/png', 'first.png');
    assert.deepEqual(planMediaSlot({ file: f, removeFlag: undefined, current: null }),
        { action: 'replace', file: f });
});

test('the remove flag clears the stored file', () => {
    assert.deepEqual(planMediaSlot({ file: null, removeFlag: '1', current: 'https://cdn/old.png' }),
        { action: 'clear' });
});

// The regression that would otherwise eat a teacher's upload: tick "remove",
// then pick a replacement. That means replace, not delete-and-store-nothing.
test('a new file beats the remove flag', () => {
    const f = file('image/png', 'replacement.png');
    assert.deepEqual(planMediaSlot({ file: f, removeFlag: 'true', current: 'https://cdn/old.png' }),
        { action: 'replace', file: f });
});

test('no file and no flag leaves the stored media untouched', () => {
    assert.deepEqual(planMediaSlot({ file: null, removeFlag: undefined, current: 'https://cdn/old.png' }),
        { action: 'keep' });
});

// Clearing a slot that holds nothing must not issue a storage delete.
test('removing media from a question that has none is a no-op', () => {
    assert.deepEqual(planMediaSlot({ file: null, removeFlag: '1', current: null }),
        { action: 'keep' });
});

// --- validation of the multipart body the admin form now posts ---------------

test('createQuestion accepts JSON-string options/answer from FormData', () => {
    const { error } = schemas.createQuestion.validate({
        quiz_id: 46,
        title: 'Which part of this circuit is the resistor?',
        type: 'mcq',
        options: JSON.stringify(['Left', 'Right']),
        answer: JSON.stringify(['Left']),
        remove_image: '0',
    });
    assert.equal(error, undefined);
});

test('createQuestion still accepts native arrays from a JSON client', () => {
    const { error } = schemas.createQuestion.validate({
        quiz_id: 46,
        title: 'Pick the correct option',
        type: 'mcq',
        options: ['Left', 'Right'],
        answer: ['Left'],
    });
    assert.equal(error, undefined);
});

test('updateQuestion accepts the remove flags the edit form sends', () => {
    const { error } = schemas.updateQuestion.validate({
        title: 'Updated question',
        type: 'true_false',
        answer: 'true',
        remove_image: '1',
        remove_video: '1',
    });
    assert.equal(error, undefined);
});

// true_false posts a bare "true"/"false", which must not be mistaken for a
// malformed JSON array.
test('a plain true/false answer still validates', () => {
    const { error } = schemas.updateQuestion.validate({
        title: 'Is this a servo?',
        type: 'true_false',
        answer: 'false',
    });
    assert.equal(error, undefined);
});

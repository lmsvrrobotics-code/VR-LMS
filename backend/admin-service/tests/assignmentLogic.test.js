// Unit tests for the teacher assignment workflow's decision logic. Pure
// functions, no DB, no network — run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    indexSubmissions,
    submissionFor,
    mergeRoster,
    tallySubmissions,
    validateScore,
    ownsBatch,
    normalizeLink,
    buildAttachments,
    parseLinksField,
    uploadAttachmentFiles,
} = require('../src/services/assignmentLogic');

// --- key matching -----------------------------------------------------------
// The real bug this guards: rosters are keyed by user_id while submissions
// carry a (often NULL) legacy student_id. A single-key lookup loses the work.

test('indexSubmissions: a submission is reachable by BOTH of its keys', () => {
    const idx = indexSubmissions([{ id: 1, user_id: 'u1', student_id: 's1' }]);
    assert.equal(idx['u1'].id, 1);
    assert.equal(idx['s1'].id, 1);
});

test('indexSubmissions: a NULL student_id does not create a bogus key', () => {
    const idx = indexSubmissions([{ id: 1, user_id: 'u1', student_id: null }]);
    assert.equal(idx['u1'].id, 1);
    assert.equal(Object.keys(idx).length, 1);
    assert.ok(!('null' in idx));
});

test('submissionFor: matches on user_id when student_id is null', () => {
    const idx = indexSubmissions([{ id: 7, user_id: 'u1', student_id: null }]);
    assert.equal(submissionFor(idx, 'u1', null)?.id, 7);
});

test('submissionFor: matches on student_id for a legacy row with no user_id', () => {
    const idx = indexSubmissions([{ id: 8, user_id: null, student_id: 's9' }]);
    assert.equal(submissionFor(idx, 'u9', 's9')?.id, 8);
});

test('submissionFor: numeric vs string ids still match', () => {
    const idx = indexSubmissions([{ id: 9, user_id: 123, student_id: null }]);
    assert.equal(submissionFor(idx, '123', null)?.id, 9);
});

// --- roster merge -----------------------------------------------------------

test('mergeRoster: non-submitters are listed with a null submission', () => {
    const rows = mergeRoster(
        [{ user_id: 'u1', student_id: null }, { user_id: 'u2', student_id: null }],
        [{ id: 1, user_id: 'u1', student_id: null }],
    );
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.user_id === 'u1').submission.id, 1);
    assert.equal(rows.find((r) => r.user_id === 'u2').submission, null);
});

test('mergeRoster: a student removed from the batch still shows their work', () => {
    const rows = mergeRoster(
        [{ user_id: 'u1', student_id: null }],
        [
            { id: 1, user_id: 'u1', student_id: null },
            { id: 2, user_id: 'gone', student_id: null },
        ],
    );
    const off = rows.find((r) => r.user_id === 'gone');
    assert.ok(off, 'off-roster submitter must still be gradeable');
    assert.equal(off.off_roster, true);
    assert.equal(off.submission.id, 2);
});

test('mergeRoster: a submission is never counted twice', () => {
    const rows = mergeRoster(
        [{ user_id: 'u1', student_id: 's1' }],
        [{ id: 1, user_id: 'u1', student_id: 's1' }],
    );
    assert.equal(rows.length, 1);
});

test('mergeRoster: empty roster and no submissions → empty list', () => {
    assert.deepEqual(mergeRoster([], []), []);
});

// --- tallies ----------------------------------------------------------------

test('tallySubmissions: counts submitted and graded per assignment', () => {
    const t = tallySubmissions([
        { assignment_id: 1, status: 'submitted' },
        { assignment_id: 1, status: 'graded' },
        { assignment_id: 2, status: 'graded' },
    ]);
    assert.deepEqual(t['1'], { submitted: 2, graded: 1 });
    assert.deepEqual(t['2'], { submitted: 1, graded: 1 });
});

test('tallySubmissions: no submissions → empty tally', () => {
    assert.deepEqual(tallySubmissions([]), {});
});

// --- score validation -------------------------------------------------------

test('validateScore: accepts a score within range', () => {
    assert.deepEqual(validateScore(45, 50), { ok: true, value: 45 });
});

test('validateScore: accepts the boundaries 0 and max', () => {
    assert.equal(validateScore(0, 50).ok, true);
    assert.equal(validateScore(50, 50).ok, true);
});

test('validateScore: rejects a score above the maximum', () => {
    const r = validateScore(9999, 50);
    assert.equal(r.ok, false);
    assert.match(r.error, /exceed the maximum of 50/);
});

test('validateScore: rejects negatives and non-numbers', () => {
    assert.equal(validateScore(-1, 50).ok, false);
    assert.equal(validateScore('abc', 50).ok, false);
    assert.equal(validateScore('', 50).ok, false);
    assert.equal(validateScore(null, 50).ok, false);
});

test('validateScore: a numeric string from a form input is accepted', () => {
    assert.deepEqual(validateScore('45', 50), { ok: true, value: 45 });
});

// --- ownership --------------------------------------------------------------

test('ownsBatch: a teacher owns only their own batches', () => {
    const owned = [{ unique_id: 'B1' }, { unique_id: 'B2' }];
    assert.equal(ownsBatch('B1', owned, 'teacher'), true);
    assert.equal(ownsBatch('B9', owned, 'teacher'), false);
});

test('ownsBatch: an admin owns every batch', () => {
    assert.equal(ownsBatch('anything', [], 'admin'), true);
    assert.equal(ownsBatch('anything', [], 'root'), true);
});

test('ownsBatch: a teacher with no batches owns nothing', () => {
    assert.equal(ownsBatch('B1', [], 'teacher'), false);
});

// --- attachments ------------------------------------------------------------

test('normalizeLink: keeps a full https URL and labels it with the host', () => {
    const a = normalizeLink('https://youtu.be/abc123');
    assert.equal(a.kind, 'link');
    assert.equal(a.url, 'https://youtu.be/abc123');
    assert.equal(a.name, 'youtu.be');
});

test('normalizeLink: assumes https for a bare domain a teacher pasted', () => {
    assert.equal(normalizeLink('example.com/worksheet.pdf').url, 'https://example.com/worksheet.pdf');
});

test('normalizeLink: an explicit name wins over the host label', () => {
    assert.equal(normalizeLink('https://example.com/x', 'Worksheet').name, 'Worksheet');
});

// SECURITY: these become clickable links in the student dashboard.
test('normalizeLink: rejects javascript: and data: URLs', () => {
    assert.equal(normalizeLink('javascript:alert(1)'), null);
    assert.equal(normalizeLink('data:text/html;base64,PHNjcmlwdD4='), null);
    assert.equal(normalizeLink('  JaVaScRiPt:alert(1)  '), null);
});

test('normalizeLink: rejects empty/garbage input', () => {
    assert.equal(normalizeLink(''), null);
    assert.equal(normalizeLink('   '), null);
    assert.equal(normalizeLink(null), null);
    assert.equal(normalizeLink('not a url'), null);
});

test('buildAttachments: files come first, then links', () => {
    const out = buildAttachments(
        ['https://example.com/a'],
        [{ url: 'https://r2/x.pdf', name: 'x.pdf', mime: 'application/pdf' }],
    );
    assert.equal(out.length, 2);
    assert.equal(out[0].kind, 'file');
    assert.equal(out[0].mime, 'application/pdf');
    assert.equal(out[1].kind, 'link');
});

test('buildAttachments: drops unusable links but keeps the good ones', () => {
    const out = buildAttachments(['javascript:alert(1)', 'https://ok.com/x'], []);
    assert.equal(out.length, 1);
    assert.equal(out[0].url, 'https://ok.com/x');
});

test('buildAttachments: no files and no links → empty array', () => {
    assert.deepEqual(buildAttachments([], []), []);
});

test('buildAttachments: skips an upload that returned no url', () => {
    assert.deepEqual(buildAttachments([], [{ url: null, name: 'failed.pdf' }]), []);
});

test('parseLinksField: accepts a JSON array (what the form sends)', () => {
    assert.deepEqual(parseLinksField('["https://a.com","https://b.com"]'), ['https://a.com', 'https://b.com']);
});

test('parseLinksField: accepts a newline or comma separated list', () => {
    assert.deepEqual(parseLinksField('https://a.com\nhttps://b.com'), ['https://a.com', 'https://b.com']);
    assert.deepEqual(parseLinksField('https://a.com, https://b.com'), ['https://a.com', 'https://b.com']);
});

test('parseLinksField: empty / malformed JSON degrades to no links', () => {
    assert.deepEqual(parseLinksField(''), []);
    assert.deepEqual(parseLinksField(null), []);
    assert.deepEqual(parseLinksField('[not json'), []);
});

// --- attachment upload reporting --------------------------------------------
// The real bug this guards: a failed upload used to be swallowed with only a
// console.warn, so the assignment was created with no material and the teacher
// was still told "sent to your students". The students then saw no reference
// material and nothing anywhere reported why.

// Minimal stand-in for helpers/fileUploader — no R2, no network.
const fakeUploader = (behaviour) => ({
    niceFileName: (base, ext) => `${base}.${ext}`,
    upload: async (file) => behaviour(file),
});

test('uploadAttachmentFiles: every file uploaded → nothing reported failed', async () => {
    const up = fakeUploader((f) => `https://cdn/${f.originalname}`);
    const { uploaded, failed } = await uploadAttachmentFiles(
        [{ originalname: 'a.pdf', mimetype: 'application/pdf' }], up);
    assert.equal(failed.length, 0);
    assert.equal(uploaded.length, 1);
    assert.equal(uploaded[0].url, 'https://cdn/a.pdf');
    assert.equal(uploaded[0].name, 'a.pdf');
    assert.equal(uploaded[0].mime, 'application/pdf');
});

test('uploadAttachmentFiles: a throwing upload is reported, not swallowed', async () => {
    const up = fakeUploader(() => { throw new Error('R2 down'); });
    const { uploaded, failed } = await uploadAttachmentFiles(
        [{ originalname: 'worksheet.pdf' }], up);
    assert.deepEqual(uploaded, []);
    assert.deepEqual(failed, ['worksheet.pdf']);
});

test('uploadAttachmentFiles: an upload returning no url counts as failed', async () => {
    const up = fakeUploader(() => null);
    const { uploaded, failed } = await uploadAttachmentFiles([{ originalname: 'empty.pdf' }], up);
    assert.deepEqual(uploaded, []);
    assert.deepEqual(failed, ['empty.pdf']);
});

test('uploadAttachmentFiles: one bad file does not lose the good ones', async () => {
    const up = fakeUploader((f) => {
        if (f.originalname === 'bad.pdf') throw new Error('rejected');
        return `https://cdn/${f.originalname}`;
    });
    const { uploaded, failed } = await uploadAttachmentFiles([
        { originalname: 'good1.pdf' }, { originalname: 'bad.pdf' }, { originalname: 'good2.pdf' },
    ], up);
    assert.deepEqual(uploaded.map((u) => u.name), ['good1.pdf', 'good2.pdf']);
    assert.deepEqual(failed, ['bad.pdf']);
});

test('uploadAttachmentFiles: no files at all is not a failure', async () => {
    const { uploaded, failed } = await uploadAttachmentFiles([], fakeUploader(() => 'x'));
    assert.deepEqual(uploaded, []);
    assert.deepEqual(failed, []);
});

test('uploadAttachmentFiles: a nameless file still reports a usable label', async () => {
    const up = fakeUploader(() => { throw new Error('nope'); });
    const { failed } = await uploadAttachmentFiles([{ mimetype: 'application/pdf' }], up);
    assert.deepEqual(failed, ['attachment']);
});

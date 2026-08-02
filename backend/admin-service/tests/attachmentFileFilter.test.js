// Which files a teacher may attach to an assignment. Pure predicate, no DB,
// no network — run with: npm test
//
// The real bug this guards: teachers could not attach PDFs or images. Two
// causes, both silent. The browser sends `application/octet-stream` for a file
// whose extension has no registered association on Windows (and
// `application/x-zip-compressed` for .zip), and the filter matched ONLY on a
// strict MIME list — so a perfectly good PDF was refused. The teacher saw
// either a greyed-out file picker or a bare "Only PDFs, images, documents…".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedAttachment } = require('../src/routes/teacherAssignment.routes');

const file = (mimetype, originalname = 'x.bin') => ({ mimetype, originalname });

// --- the types that always worked -------------------------------------------

test('accepts a PDF declared with the correct MIME type', () => {
    assert.equal(isAllowedAttachment(file('application/pdf', 'worksheet.pdf')), true);
});

test('accepts the common image types', () => {
    for (const m of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
        assert.equal(isAllowedAttachment(file(m, 'photo')), true, `${m} must be allowed`);
    }
});

test('accepts Word documents (.doc and .docx)', () => {
    assert.equal(isAllowedAttachment(file('application/msword', 'a.doc')), true);
    assert.equal(isAllowedAttachment(
        file('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')), true);
});

// --- the regressions --------------------------------------------------------

test('accepts a PDF Windows reported as application/octet-stream', () => {
    assert.equal(isAllowedAttachment(file('application/octet-stream', 'worksheet.pdf')), true);
});

test('accepts an image the browser gave no MIME type at all', () => {
    assert.equal(isAllowedAttachment(file('', 'diagram.png')), true);
    assert.equal(isAllowedAttachment(file(undefined, 'diagram.jpg')), true);
});

test("accepts Windows' application/x-zip-compressed for a .zip", () => {
    assert.equal(isAllowedAttachment(file('application/x-zip-compressed', 'pack.zip')), true);
});

test('accepts image/pjpeg, which older browsers still send', () => {
    assert.equal(isAllowedAttachment(file('image/pjpeg', 'scan.jpg')), true);
});

// --- what must still be refused ---------------------------------------------
// SECURITY: the extension fallback must not become a way to smuggle anything in.

test('rejects an executable even when its extension looks safe', () => {
    // An explicitly declared dangerous type is never laundered by a .pdf name.
    assert.equal(isAllowedAttachment(file('application/x-msdownload', 'invoice.pdf')), false);
});

test('rejects an octet-stream whose extension is NOT on the allowlist', () => {
    assert.equal(isAllowedAttachment(file('application/octet-stream', 'payload.exe')), false);
    assert.equal(isAllowedAttachment(file('application/octet-stream', 'script.sh')), false);
    assert.equal(isAllowedAttachment(file('application/octet-stream', 'noext')), false);
});

test('rejects a vague MIME type with no filename to fall back on', () => {
    assert.equal(isAllowedAttachment(file('application/octet-stream', '')), false);
    assert.equal(isAllowedAttachment({}), false);
});

test('rejects scripts and HTML outright', () => {
    assert.equal(isAllowedAttachment(file('text/html', 'page.html')), false);
    assert.equal(isAllowedAttachment(file('application/javascript', 'x.js')), false);
});

test('extension match is case-insensitive (Windows loves .PDF)', () => {
    assert.equal(isAllowedAttachment(file('application/octet-stream', 'REPORT.PDF')), true);
    assert.equal(isAllowedAttachment(file('application/octet-stream', 'Photo.JPEG')), true);
});

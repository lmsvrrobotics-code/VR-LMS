// Pure decision logic for the teacher assignment workflow — NO database, NO
// network. Extracted from TeacherAssignmentService so the fiddly parts (roster
// ↔ submission key matching, score validation, tallies) can be unit-tested.
// See tests/assignmentLogic.test.js.

// Index submissions by BOTH keys. Submissions are written with a student_id
// and a user_id, but older/legacy rows populate only one of them, and rosters
// are keyed by user_id — so a single-key lookup silently orphans a student's
// work from their name.
const indexSubmissions = (subs = []) => {
    const byKey = {};
    for (const s of subs) {
        if (s.user_id != null && s.user_id !== '') byKey[String(s.user_id)] = s;
        if (s.student_id != null && s.student_id !== '') byKey[String(s.student_id)] = s;
    }
    return byKey;
};

// Find the submission belonging to a roster member, trying either key.
const submissionFor = (byKey, userId, studentId) =>
    byKey[String(userId)] || byKey[String(studentId)] || null;

// Merge a roster with its submissions. Every active member appears (so
// non-submitters are visible), plus anyone who submitted then left the batch,
// flagged off_roster so their work is still gradeable.
const mergeRoster = (members = [], subs = []) => {
    const byKey = indexSubmissions(subs);
    const rows = members.map((m) => ({
        user_id: m.user_id == null ? null : String(m.user_id),
        student_id: m.student_id == null ? null : String(m.student_id),
        submission: submissionFor(byKey, m.user_id, m.student_id),
    }));

    const seen = new Set(
        rows.flatMap((r) => [r.user_id, r.student_id]).filter(Boolean).map(String)
    );
    for (const s of subs) {
        const key = String(s.user_id ?? s.student_id ?? '');
        if (key && !seen.has(key)) {
            rows.push({
                user_id: s.user_id == null ? null : String(s.user_id),
                student_id: s.student_id == null ? null : String(s.student_id),
                submission: s,
                off_roster: true,
            });
            seen.add(key);
        }
    }
    return rows;
};

// Per-assignment submitted/graded counts, keyed by assignment id.
const tallySubmissions = (subs = []) => {
    const out = {};
    for (const s of subs) {
        const k = String(s.assignment_id);
        out[k] = out[k] || { submitted: 0, graded: 0 };
        out[k].submitted += 1;
        if (s.status === 'graded') out[k].graded += 1;
    }
    return out;
};

// Validate a score against the assignment maximum. Returns { ok, value, error }
// rather than throwing so it can be reused in and out of a request context.
const validateScore = (score, maxScore) => {
    const max = Number(maxScore) || 100;
    const n = Number(score);
    if (score === '' || score == null || !Number.isFinite(n)) {
        return { ok: false, error: 'Score must be a number' };
    }
    if (n < 0) return { ok: false, error: 'Score must be a positive number' };
    if (n > max) return { ok: false, error: `Score cannot exceed the maximum of ${max}` };
    return { ok: true, value: n };
};

// Does this teacher own the batch? Admins always do.
const ownsBatch = (batchId, ownedBatches = [], role = 'teacher') => {
    if (role === 'admin' || role === 'root') return true;
    return ownedBatches.some((b) => String(b.unique_id ?? b) === String(batchId));
};

// --- attachments ------------------------------------------------------------

// Only these schemes may be stored as a link. Blocks `javascript:` and
// `data:` URLs, which would otherwise be rendered as clickable links in the
// student's dashboard and execute in their session.
const SAFE_LINK = /^https?:\/\//i;

// Normalize one teacher-supplied link into an attachment, or null if unusable.
// Accepts a bare "example.com/x.pdf" by assuming https, which is what a
// teacher pasting from a browser address bar will produce.
const normalizeLink = (raw, name = null) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const url = SAFE_LINK.test(s) ? s : (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s) ? `https://${s}` : null);
    if (!url || !SAFE_LINK.test(url)) return null;
    let label = String(name ?? '').trim();
    if (!label) {
        try { label = new URL(url).hostname.replace(/^www\./, ''); } catch { label = url; }
    }
    return { kind: 'link', url, name: label, mime: null };
};

// Build the stored attachments array from the teacher's links plus whatever
// files were uploaded. Order is preserved: files first (they're the primary
// material), then links.
const buildAttachments = (links = [], uploaded = []) => {
    const out = [];
    for (const f of uploaded) {
        if (!f || !f.url) continue;
        out.push({
            kind: 'file',
            url: String(f.url),
            name: String(f.name || 'attachment'),
            mime: f.mime ? String(f.mime) : null,
        });
    }
    for (const l of links) {
        const norm = typeof l === 'string' ? normalizeLink(l) : normalizeLink(l?.url, l?.name);
        if (norm) out.push(norm);
    }
    return out;
};

// Parse the `links` field off a multipart form. The browser may send it as a
// JSON array, repeated fields, or a single string — accept all three so the
// form doesn't silently drop what the teacher typed.
const parseLinksField = (value) => {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    const s = String(value).trim();
    if (!s) return [];
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    }
    // newline/comma separated fallback
    return s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
};

// Push each uploaded file to storage and report BOTH outcomes. One bad file
// must not lose the whole assignment (the teacher's typed work matters more
// than one attachment), so failures are skipped — but they are returned rather
// than swallowed, otherwise the teacher is told "sent" about material the
// students will never see. `uploader` is injected so this stays testable
// without R2 credentials.
const uploadAttachmentFiles = async (files = [], uploader) => {
    const uploaded = [];
    const failed = [];
    for (const f of files) {
        const label = f?.originalname || 'attachment';
        try {
            const ext = String(f.originalname || '').split('.').pop() || 'bin';
            const safe = uploader.niceFileName(
                String(f.originalname || 'attachment').replace(/\.[^.]+$/, ''),
                ext,
            );
            const url = await uploader.upload(f, `uploads/assignments/${safe}`);
            if (url) uploaded.push({ url, name: f.originalname || safe, mime: f.mimetype || null });
            // A falsy url is a failure too — nothing came back to store.
            else failed.push(label);
        } catch (e) {
            console.warn('[teacher-assignments] attachment upload failed:', e.message);
            failed.push(label);
        }
    }
    return { uploaded, failed };
};

module.exports = {
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
};

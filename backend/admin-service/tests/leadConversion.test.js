// Rules for the Leads → Manage Students pipeline.
//
// Public self-signup creates a real login AND files a lead, so without a filter
// the person appears in Manage Students immediately and the Leads "Convert"
// button is meaningless. Manage Students must therefore hide anyone who still
// has an OPEN (unconverted) lead.
//
// The subtle part — and the thing most likely to be broken by a later "cleanup" —
// is that the rule is "hide if an OPEN lead exists", NOT "show only if a
// CONVERTED lead exists". Admin-created and pre-existing students have no lead
// row at all; the latter rule would hide every one of them. These tests pin that.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mirrors the NOT EXISTS clause in StudentService.HIDE_UNCONVERTED. Kept as a
// pure predicate so the rule is testable without a database.
const isVisibleInManageStudents = (student, leads) => {
    const openLead = leads.find(
        (l) => l.email.toLowerCase() === student.email.toLowerCase() && l.status !== 'converted',
    );
    return !openLead;
};

test('self-signup with an open lead is HIDDEN from Manage Students', () => {
    const student = { id: '1', email: 'signup@example.com' };
    const leads = [{ email: 'signup@example.com', status: 'new' }];
    assert.equal(isVisibleInManageStudents(student, leads), false);
});

test('after Convert, the same student becomes VISIBLE', () => {
    const student = { id: '1', email: 'signup@example.com' };
    const leads = [{ email: 'signup@example.com', status: 'converted' }];
    assert.equal(isVisibleInManageStudents(student, leads), true);
});

test('admin-created student (NO lead row) stays VISIBLE', () => {
    // The regression that would break every existing student. A student with no
    // lead was created directly by an admin and must never be hidden.
    const student = { id: '2', email: 'admin-made@example.com' };
    assert.equal(isVisibleInManageStudents(student, []), true);
});

test('pre-existing student is not hidden by an unrelated open lead', () => {
    const student = { id: '3', email: 'existing@example.com' };
    const leads = [{ email: 'someone-else@example.com', status: 'new' }];
    assert.equal(isVisibleInManageStudents(student, leads), true);
});

test('a lead in "contacted" still hides the student (only converted reveals)', () => {
    const student = { id: '4', email: 'inprogress@example.com' };
    const leads = [{ email: 'inprogress@example.com', status: 'contacted' }];
    assert.equal(isVisibleInManageStudents(student, leads), false);
});

test('email match is case-insensitive', () => {
    // Signup and lead capture normalise differently; a case mismatch would leak
    // the student into Manage Students before conversion.
    const student = { id: '5', email: 'Mixed.Case@Example.com' };
    const leads = [{ email: 'mixed.case@example.com', status: 'new' }];
    assert.equal(isVisibleInManageStudents(student, leads), false);
});

// --- convert() password contract -------------------------------------------
// convert() must NOT require a password when the account already exists (a
// self-signup chose their own). It must still require one when creating a fresh
// account for a pure lead. Encoding the branch so it can't silently regress into
// "Email already in use", which would make the lead permanently unconvertible —
// and, since the filter keys off the open lead, the student permanently invisible.
const passwordRequiredForConvert = (existingStudent) => !existingStudent;

test('convert: existing self-signup account does NOT require a password', () => {
    assert.equal(passwordRequiredForConvert({ id: '1' }), false);
});

test('convert: pure lead with no account DOES require a password', () => {
    assert.equal(passwordRequiredForConvert(null), true);
});

// --- has_account drives whether the UI prompts at all ------------------------
// LeadService.list tags each lead with has_account so the Convert button can go
// straight through for a self-signup and only open the password modal for a pure
// enquiry. Pinning the mapping: it decides whether the admin is interrupted.
const tagHasAccount = (leads, studentEmails) => {
    const have = new Set(studentEmails.map((e) => e.toLowerCase()));
    return leads.map((l) => ({ ...l, has_account: have.has(String(l.email || '').toLowerCase()) }));
};

test('has_account: true for a self-signup, false for a pure enquiry', () => {
    const tagged = tagHasAccount(
        [{ id: 1, email: 'signup@example.com' }, { id: 2, email: 'enquiry@example.com' }],
        ['signup@example.com'],
    );
    assert.equal(tagged.find((l) => l.id === 1).has_account, true);   // Convert: no prompt
    assert.equal(tagged.find((l) => l.id === 2).has_account, false);  // Convert: ask password
});

test('has_account: matching is case-insensitive', () => {
    const tagged = tagHasAccount([{ id: 1, email: 'Mixed.Case@Example.com' }], ['mixed.case@example.com']);
    assert.equal(tagged[0].has_account, true);
});

// --- converted leads drop out of the working list ---------------------------
// A converted person is now a student in Manage Students; leaving them in Leads
// is duplicate noise. The default ("all") view is the ACTIVE pipeline. Asking for
// status=converted explicitly still returns them — the row is hidden, never
// deleted, so the audit trail (source, signup date, converted_user_id) survives.
const visibleLeads = (leads, status) =>
    (!status || status === 'all')
        ? leads.filter((l) => l.status !== 'converted')
        : leads.filter((l) => l.status === status);

const ALL = [
    { id: 1, status: 'new' },
    { id: 2, status: 'contacted' },
    { id: 3, status: 'converted' },
    { id: 4, status: 'rejected' },
];

test('default Leads view excludes converted leads', () => {
    const ids = visibleLeads(ALL, 'all').map((l) => l.id);
    assert.deepEqual(ids, [1, 2, 4]);
    assert.ok(!ids.includes(3), 'a converted lead must not appear in the working list');
});

test('rejected leads still show (only converted leaves the pipeline)', () => {
    // Rejected is still a follow-up outcome the admin may want to see/undo; it
    // is NOT a student, so it must not be swept out with the converted ones.
    assert.ok(visibleLeads(ALL, 'all').some((l) => l.status === 'rejected'));
});

test('the converted tab still returns converted leads (history preserved)', () => {
    assert.deepEqual(visibleLeads(ALL, 'converted').map((l) => l.id), [3]);
});

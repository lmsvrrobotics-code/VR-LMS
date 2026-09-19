// Tests for founder-meeting REGISTRATION.
//
// The design change these pin down: the join link is no longer published on
// the public page. Visitors register, the link is released to them in the
// registration response, and the admin gets a list of who is coming.
//
// The security-relevant assertion is that `publicPayload` never carries
// `meeting_link` — if it did, the whole registration gate would be cosmetic,
// since anyone could read the link out of the page source.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    publicPayload, canRegister, registrationPatch, meetingPatch,
} = require('../src/lib/founderMeeting');

const AT = '2026-09-10T18:00:00Z';
const at = (iso) => new Date(iso);

const MEETING = {
    id: 1,
    title: 'Weekly Meeting with Founder',
    description: 'Ask anything',
    scheduled_at: AT,
    duration_mins: 60,
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    video_url: null,
    poster_url: 'https://cdn.example.com/poster.png',
    registration_open: true,
    capacity: null,
    status: 1,
};

// --- the link must never be public ------------------------------------------

test('the public payload does not carry the join link', () => {
    // Publishing it would make registration pointless — anyone could read the
    // link out of the page source and join without signing up.
    const p = publicPayload(MEETING, at('2026-09-09T00:00:00Z'));
    assert.ok(!('meeting_link' in p), 'meeting_link must not reach the browser');
});

test('the link stays withheld while the meeting is live', () => {
    const p = publicPayload(MEETING, at('2026-09-10T18:10:00Z'));
    assert.ok(!('meeting_link' in p));
});

test('the payload still carries what the page renders', () => {
    const p = publicPayload(MEETING, at('2026-09-09T00:00:00Z'));
    for (const key of ['title', 'description', 'scheduled_at', 'state', 'can_register']) {
        assert.ok(key in p, `${key} should be present`);
    }
});

// --- when registration is available -----------------------------------------

test('an upcoming meeting accepts registrations', () => {
    assert.equal(canRegister(MEETING, 'upcoming'), true);
});

test('a live meeting still accepts registrations', () => {
    // Latecomers should still be able to get the link.
    assert.equal(canRegister(MEETING, 'live'), true);
});

test('a finished meeting does not', () => {
    // Collecting an address for a call that already happened helps nobody.
    assert.equal(canRegister(MEETING, 'past'), false);
});

test('the admin switch closes registration regardless of timing', () => {
    assert.equal(canRegister({ ...MEETING, registration_open: false }, 'upcoming'), false);
});

test('an unscheduled meeting can still take registrations', () => {
    // "Announced, date to follow" is a valid state to collect interest in.
    assert.equal(canRegister({ ...MEETING, scheduled_at: null }), true);
});

test('canRegister is reflected in the public payload', () => {
    const past = publicPayload(MEETING, at('2026-09-11T00:00:00Z'));
    assert.equal(past.can_register, false);
    const soon = publicPayload(MEETING, at('2026-09-09T00:00:00Z'));
    assert.equal(soon.can_register, true);
});

// --- the registration form ---------------------------------------------------

const form = (over = {}) => ({
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '9876543210',
    ...over,
});

test('a valid registration is normalised', () => {
    const r = registrationPatch(form());
    assert.equal(r.ok, true);
    assert.equal(r.value.name, 'Asha Rao');
    assert.equal(r.value.email, 'asha@example.com');
});

test('the email is lowercased so the duplicate index actually catches repeats', () => {
    // Without this, "Asha@Example.COM" and "asha@example.com" would be two
    // rows for one person and inflate the headcount.
    const r = registrationPatch(form({ email: '  Asha@Example.COM ' }));
    assert.equal(r.value.email, 'asha@example.com');
});

test('a malformed email is rejected with an actionable message', () => {
    const r = registrationPatch(form({ email: 'abc' }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'email');
    assert.match(r.message, /@ sign/);
});

test('a missing name is rejected', () => {
    const r = registrationPatch(form({ name: '' }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'name');
});

test('the phone is optional', () => {
    const r = registrationPatch(form({ phone: '' }));
    assert.equal(r.ok, true);
    assert.equal(r.value.phone, null);
});

test('a bad phone is still rejected when one is supplied', () => {
    const r = registrationPatch(form({ phone: '12345' }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'phone');
});

test('the phone is stored bare so lookups match however it was typed', () => {
    assert.equal(registrationPatch(form({ phone: '+91 98765 43210' })).value.phone, '9876543210');
});

test('an optional message is carried through', () => {
    const r = registrationPatch(form({ message: 'How do I start with robotics?' }));
    assert.equal(r.value.message, 'How do I start with robotics?');
});

test('an over-long message is rejected rather than truncated', () => {
    const r = registrationPatch(form({ message: 'x'.repeat(2001) }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'message');
});

// --- admin form: capacity + the registration switch --------------------------

const adminForm = (over = {}) => ({ title: 'Weekly Meeting with Founder', ...over });

test('capacity is optional and blank means unlimited', () => {
    assert.equal(meetingPatch(adminForm({ capacity: '' })).value.capacity, null);
    assert.equal(meetingPatch(adminForm()).value.capacity, null);
});

test('a numeric capacity is stored as a number', () => {
    assert.equal(meetingPatch(adminForm({ capacity: '50' })).value.capacity, 50);
});

test('a zero or fractional capacity is rejected', () => {
    assert.equal(meetingPatch(adminForm({ capacity: '0' })).ok, false);
    assert.equal(meetingPatch(adminForm({ capacity: '2.5' })).ok, false);
    assert.equal(meetingPatch(adminForm({ capacity: '-5' })).ok, false);
});

test('registration defaults to OPEN on create', () => {
    // A meeting nobody can register for is rarely what "add a meeting" means.
    assert.equal(meetingPatch(adminForm()).value.registration_open, true);
});

test('registration can be explicitly closed on create', () => {
    assert.equal(meetingPatch(adminForm({ registration_open: '0' })).value.registration_open, false);
});

test('an update leaves registration settings alone when not submitted', () => {
    const r = meetingPatch({ title: 'Renamed' }, { partial: true });
    assert.ok(!('registration_open' in r.value));
    assert.ok(!('capacity' in r.value));
});

// --- seats as the ADMIN FORM submits them ------------------------------------
//
// The form is multipart, so every value arrives as a STRING. These cover the
// exact shapes the Add Meeting form produces, which is where a number/string
// mismatch would otherwise slip through unnoticed.

test('a seat count typed into the form is stored as a number', () => {
    assert.strictEqual(meetingPatch(adminForm({ capacity: '25' })).value.capacity, 25);
});

test('an empty seats box means unlimited, not zero', () => {
    // Zero would close registration entirely — the opposite of "no limit".
    const v = meetingPatch(adminForm({ capacity: '' })).value.capacity;
    assert.strictEqual(v, null);
    assert.notStrictEqual(v, 0);
});

test('whitespace in the seats box is treated as unlimited', () => {
    assert.strictEqual(meetingPatch(adminForm({ capacity: '   ' })).value.capacity, null);
});

test('a non-numeric seat count is rejected with a usable message', () => {
    const r = meetingPatch(adminForm({ capacity: 'ten' }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'capacity');
    assert.match(r.message, /whole number/);
});

test('one seat is a legitimate limit', () => {
    // A one-to-one session with the founder is a real thing to schedule.
    assert.strictEqual(meetingPatch(adminForm({ capacity: '1' })).value.capacity, 1);
});

test('the registration dropdown maps to a boolean', () => {
    assert.strictEqual(meetingPatch(adminForm({ registration_open: '1' })).value.registration_open, true);
    assert.strictEqual(meetingPatch(adminForm({ registration_open: '0' })).value.registration_open, false);
});

test('editing only the seats leaves everything else untouched', () => {
    // Partial update: the form posts every field, but a caller sending just
    // this one must not blank the schedule or the link.
    const r = meetingPatch({ capacity: '40' }, { partial: true });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value), ['capacity']);
    assert.strictEqual(r.value.capacity, 40);
});

test('seats can be lifted back to unlimited on an edit', () => {
    const r = meetingPatch({ capacity: '' }, { partial: true });
    assert.strictEqual(r.value.capacity, null);
});

test('a full meeting reports no seats left rather than a negative number', () => {
    // registered_count can exceed capacity if an admin lowers the limit after
    // people have signed up; the page must not render "-3 seats left".
    const seatsLeft = (capacity, taken) => Math.max(0, capacity - taken);
    assert.equal(seatsLeft(10, 10), 0);
    assert.equal(seatsLeft(10, 14), 0);
    assert.equal(seatsLeft(10, 3), 7);
});

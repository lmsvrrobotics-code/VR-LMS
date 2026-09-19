// Tests for lib/founderMeeting — the rules behind the "Weekly Meeting with
// Founder" admin form and the public home-page section.
//
// Two things carry real risk here and are covered hardest:
//
//   1. `meeting_link` is rendered as an anchor on a PUBLIC page. A
//      `javascript:` URL stored by an admin (or by anyone who compromised an
//      admin account) would be stored XSS reaching every visitor.
//   2. live/upcoming/past is computed SERVER-side. If it were left to the
//      browser, a visitor with a wrong device clock would see a Join button
//      for a call that finished hours ago.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    meetingPatch, meetingState, publicPayload, normalizeLink,
    normalizeDuration, normalizeScheduledAt, toBool,
} = require('../src/lib/founderMeeting');

// --- meeting link: the XSS surface ------------------------------------------

test('a javascript: link is rejected', () => {
    const r = normalizeLink('javascript:alert(1)');
    assert.equal(r.ok, false);
    assert.match(r.message, /https/);
});

test('a data: link is rejected', () => {
    assert.equal(normalizeLink('data:text/html,<script>alert(1)</script>').ok, false);
});

test('a vbscript: link is rejected', () => {
    assert.equal(normalizeLink('vbscript:msgbox(1)').ok, false);
});

test('a bare word is not a link', () => {
    assert.equal(normalizeLink('zoom-us').ok, false);
});

test('ordinary meeting links are accepted', () => {
    for (const url of [
        'https://meet.google.com/abc-defg-hij',
        'https://zoom.us/j/1234567890',
        'https://teams.microsoft.com/l/meetup-join/xyz',
        'http://internal.example.com/room/1',
    ]) {
        assert.equal(normalizeLink(url).ok, true, `${url} must be accepted`);
    }
});

test('an empty link is allowed and stored as null', () => {
    // A recording-only announcement has no join link.
    const r = normalizeLink('');
    assert.equal(r.ok, true);
    assert.equal(r.value, null);
});

// --- schedule ---------------------------------------------------------------

test('an unparseable date is rejected', () => {
    const r = normalizeScheduledAt('next tuesday-ish');
    assert.equal(r.ok, false);
    assert.match(r.message, /valid date/);
});

test('an empty date is allowed — an announcement with no fixed slot', () => {
    assert.deepEqual(normalizeScheduledAt(''), { ok: true, value: null });
});

test('an ISO datetime is parsed', () => {
    const r = normalizeScheduledAt('2026-09-10T18:30:00Z');
    assert.equal(r.ok, true);
    assert.equal(r.value.toISOString(), '2026-09-10T18:30:00.000Z');
});

// --- duration ---------------------------------------------------------------

test('duration defaults to 60 minutes when omitted', () => {
    assert.deepEqual(normalizeDuration(''), { ok: true, value: 60 });
});

test('a non-numeric duration is rejected', () => {
    assert.equal(normalizeDuration('an hour').ok, false);
});

test('a zero or negative duration is rejected', () => {
    assert.equal(normalizeDuration('0').ok, false);
    assert.equal(normalizeDuration('-30').ok, false);
});

test('an absurd duration is rejected', () => {
    // A typo like 6000 would keep the "live now" banner up for four days.
    const r = normalizeDuration('6000');
    assert.equal(r.ok, false);
    assert.match(r.message, /1440/);
});

// --- state ------------------------------------------------------------------

const AT = '2026-09-10T18:00:00Z';
const at = (iso) => new Date(iso);

test('before the start time the meeting is upcoming', () => {
    assert.equal(meetingState({ scheduled_at: AT, duration_mins: 60 }, at('2026-09-10T17:59:00Z')), 'upcoming');
});

test('at the start time the meeting is live', () => {
    assert.equal(meetingState({ scheduled_at: AT, duration_mins: 60 }, at(AT)), 'live');
});

test('the meeting stays live for its whole duration', () => {
    // The join link must not vanish the instant the call begins — latecomers
    // still need it.
    assert.equal(meetingState({ scheduled_at: AT, duration_mins: 60 }, at('2026-09-10T18:59:00Z')), 'live');
});

test('after the duration elapses the meeting is past', () => {
    assert.equal(meetingState({ scheduled_at: AT, duration_mins: 60 }, at('2026-09-10T19:00:01Z')), 'past');
});

test('a meeting with no schedule is unscheduled, never past', () => {
    assert.equal(meetingState({ scheduled_at: null }, at(AT)), 'unscheduled');
});

test('an invalid stored date degrades to unscheduled rather than throwing', () => {
    assert.equal(meetingState({ scheduled_at: 'not-a-date' }, at(AT)), 'unscheduled');
});

test('a missing duration falls back to 60 minutes', () => {
    assert.equal(meetingState({ scheduled_at: AT }, at('2026-09-10T18:30:00Z')), 'live');
    assert.equal(meetingState({ scheduled_at: AT }, at('2026-09-10T19:30:00Z')), 'past');
});

// --- public payload ---------------------------------------------------------

const ROW = {
    id: 1,
    title: 'Weekly Meeting with Founder',
    description: 'Ask anything',
    scheduled_at: AT,
    duration_mins: 60,
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    video_url: 'https://video.example.com/embed/1',
    poster_url: 'https://cdn.example.com/poster.jpg',
    status: 1,
    is_featured: true,
};

// The join link used to be part of the public payload, withheld only once the
// meeting was past. It is now NEVER published: visitors register and the link
// is released in the registration response, so the admin knows who attends and
// the meeting is not open to anyone who reads the page source.
// See founderRegistration.test.js for the replacement coverage.

test('the join link is never public, at any point in the meeting lifecycle', () => {
    for (const [label, when] of [
        ['upcoming', '2026-09-09T00:00:00Z'],
        ['live', '2026-09-10T18:10:00Z'],
        ['past', '2026-09-11T00:00:00Z'],
    ]) {
        const p = publicPayload(ROW, at(when));
        assert.ok(!('meeting_link' in p), `link leaked while ${label}`);
    }
});

test('state is still reported correctly without the link', () => {
    assert.equal(publicPayload(ROW, at('2026-09-11T00:00:00Z')).state, 'past');
    assert.equal(publicPayload(ROW, at('2026-09-10T18:10:00Z')).state, 'live');
});

test('a past meeting keeps its recording and poster', () => {
    // The video is still worth watching after the call.
    const p = publicPayload(ROW, at('2026-09-11T00:00:00Z'));
    assert.equal(p.video_url, ROW.video_url);
    assert.equal(p.poster_url, ROW.poster_url);
});

test('the public payload carries no internal columns', () => {
    const p = publicPayload(ROW, at(AT));
    for (const key of ['status', 'is_featured', 'created_at', 'updated_at']) {
        assert.ok(!(key in p), `${key} must not reach the public payload`);
    }
});

test('a null row yields null rather than an empty shell', () => {
    // The home page omits the section entirely when nothing is featured.
    assert.equal(publicPayload(null), null);
});

// --- the admin form ---------------------------------------------------------

const form = (over = {}) => ({
    title: 'Weekly Meeting with Founder',
    description: 'Ask the founder anything',
    scheduled_at: AT,
    duration_mins: '45',
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    ...over,
});

test('a valid submission is normalised', () => {
    const r = meetingPatch(form());
    assert.equal(r.ok, true);
    assert.equal(r.value.duration_mins, 45);
    assert.equal(r.value.title, 'Weekly Meeting with Founder');
});

test('a missing title is rejected and names the field', () => {
    const r = meetingPatch(form({ title: '' }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'title');
});

test('a bad link is rejected before anything is stored', () => {
    const r = meetingPatch(form({ meeting_link: 'javascript:alert(1)' }));
    assert.equal(r.ok, false);
    assert.equal(r.field, 'meeting_link');
});

test('multipart checkbox values are read as booleans', () => {
    // Over multipart these arrive as strings, and "on" is what a bare
    // <input type="checkbox"> submits.
    assert.equal(meetingPatch(form({ is_featured: 'on' })).value.is_featured, true);
    assert.equal(meetingPatch(form({ is_featured: '1' })).value.is_featured, true);
    assert.equal(meetingPatch(form({ is_featured: 'false' })).value.is_featured, false);
    assert.equal(meetingPatch(form()).value.is_featured, false);
});

test('status defaults to published and accepts an explicit draft', () => {
    assert.equal(meetingPatch(form()).value.status, 1);
    assert.equal(meetingPatch(form({ status: '0' })).value.status, 0);
});

test('an update omits untouched fields rather than nulling them', () => {
    // Partial semantics: a form that only changes the title must not wipe the
    // schedule and the join link.
    const r = meetingPatch({ title: 'Renamed' }, { partial: true });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value), ['title']);
});

test('an update can still clear a field explicitly', () => {
    const r = meetingPatch({ meeting_link: '' }, { partial: true });
    assert.equal(r.ok, true);
    assert.equal(r.value.meeting_link, null);
});

test('an update still validates the fields it does touch', () => {
    const r = meetingPatch({ meeting_link: 'javascript:alert(1)' }, { partial: true });
    assert.equal(r.ok, false);
});

test('toBool accepts the shapes a form can send and nothing else', () => {
    for (const v of [true, 1, '1', 'true', 'on']) assert.equal(toBool(v), true, String(v));
    for (const v of [false, 0, '0', 'false', '', null, undefined, 'maybe']) {
        assert.equal(toBool(v), false, String(v));
    }
});

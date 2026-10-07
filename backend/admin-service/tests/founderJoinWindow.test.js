/**
 * The joining link opens one hour before the session.
 *
 * It used to be handed over the moment someone registered — potentially days
 * ahead. People clicked it early, found an empty room, and had no way to tell a
 * wrong link from a wrong time. The link is now withheld until
 * JOIN_WINDOW_MINS before the start, so a visible Join button always means
 * "this works right now".
 *
 * The boundaries are the whole point here, so they are tested exactly: one
 * minute either side of the opening edge, and either side of the closing one.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isJoinWindowOpen, JOIN_WINDOW_MINS, meetingState,
} = require('../src/lib/founderMeeting');

const START = Date.parse('2026-10-05T06:00:00.000Z');
const DURATION = 90;
const meeting = { scheduled_at: new Date(START).toISOString(), duration_mins: DURATION };
// `offset` minutes relative to the session start.
const at = (offset) => new Date(START + offset * 60000);

test('the window is one hour', () => {
  assert.equal(JOIN_WINDOW_MINS, 60);
});

test('the link stays closed until exactly one hour before', () => {
  assert.equal(isJoinWindowOpen(meeting, at(-24 * 60)), false, 'a day early: closed');
  assert.equal(isJoinWindowOpen(meeting, at(-61)), false, '61 min before: closed');
  assert.equal(isJoinWindowOpen(meeting, at(-60)), true, 'exactly 60 min before: OPEN');
  assert.equal(isJoinWindowOpen(meeting, at(-59)), true, '59 min before: open');
  assert.equal(isJoinWindowOpen(meeting, at(-1)), true, 'a minute before: open');
});

test('the link stays open for the whole session, then closes', () => {
  // A late joiner must not be locked out mid-call.
  assert.equal(isJoinWindowOpen(meeting, at(0)), true, 'at the start: open');
  assert.equal(isJoinWindowOpen(meeting, at(DURATION - 1)), true, 'near the end: open');
  assert.equal(isJoinWindowOpen(meeting, at(DURATION + 1)), false, 'past: closed');
  assert.equal(meetingState(meeting, at(DURATION + 1)), 'past');
});

test('an unscheduled meeting releases its link immediately', () => {
  // There is no start to count back from; withholding it forever would be worse
  // than releasing it.
  assert.equal(isJoinWindowOpen({ scheduled_at: null }, at(0)), true);
  assert.equal(isJoinWindowOpen({ scheduled_at: 'nonsense' }, at(0)), true);
});

test('the service gates both release points on the window', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const svc = fs
    .readFileSync(path.join(__dirname, '..', 'src', 'services', 'FounderMeetingService.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  // Every place a meeting_link is handed out must be behind the window.
  // The lookbehind excludes `has_meeting_link:`, which is a boolean flag
  // telling the client a link EXISTS — not a release of the link itself.
  const releases = svc.match(/(?<![\w_])meeting_link:[^,\n]*/g) || [];
  assert.ok(releases.length >= 3, 'expected the registration, duplicate and dashboard responses');
  for (const line of releases) {
    if (/meeting_link: null/.test(line)) continue;
    assert.ok(
      /isJoinWindowOpen|linkReady|windowOpen/.test(line),
      `an ungated link release: ${line.trim()}`,
    );
  }
});

test('the dashboard tells the client when the link opens', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const svc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'FounderMeetingService.js'), 'utf8');
  // Without these the UI can only say "not yet", which reads as broken.
  assert.match(svc, /has_meeting_link/, 'the client must distinguish "no link" from "not yet"');
  assert.match(svc, /join_opens_at/, 'the client needs the exact time to show');
  assert.match(svc, /join_window_mins/, 'the copy must quote the server-side number');
});

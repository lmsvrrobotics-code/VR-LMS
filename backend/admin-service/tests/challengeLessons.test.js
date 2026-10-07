/**
 * CHALLENGE lessons — an external task the student submits a link for.
 *
 * The rules that matter here are about TRUST, so they are tested as rules
 * rather than through the UI:
 *
 *  1. Submitting must not complete the lesson. Only a teacher's approval
 *     writes the LessonCompletion row — otherwise any student could advance
 *     their own progress bar by pasting an arbitrary URL.
 *  2. Withdrawing an approval must remove that completion again, or the
 *     progress bar keeps claiming a lesson is done after the verdict changed.
 *  3. The submitted URL is rendered as an anchor and clicked by a TEACHER, so
 *     the protocol allowlist is a stored-XSS boundary, not formatting.
 *  4. One row per (lesson, student): a resubmission updates in place, so the
 *     review queue never shows a pile of attempts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

// --- URL validation (pure, so exercised directly) --------------------------
const { normalizeUrl, STATUSES } = require('../src/services/ChallengeService');

test('only http(s) submission links are accepted', () => {
  for (const ok of [
    'https://scratch.mit.edu/projects/123',
    'http://example.com/a?b=c#d',
  ]) {
    assert.equal(typeof normalizeUrl(ok), 'string', `${ok} should be accepted`);
  }
  // Each of these would be live in the teacher's browser if it were stored.
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]) {
    assert.throws(() => normalizeUrl(bad), /http/i, `${bad} must be rejected`);
  }
});

test('an empty or malformed link is rejected', () => {
  for (const bad of ['', '   ', null, undefined, 'not a url', 'www.example.com']) {
    assert.throws(() => normalizeUrl(bad));
  }
});

test('an over-long link is rejected before it reaches the database', () => {
  assert.throws(() => normalizeUrl('https://x.test/' + 'a'.repeat(2100)), /too long/i);
});

// --- The completion rule ----------------------------------------------------
test('nothing in this service completes a class', () => {
  // Completion is the STUDENT's action — the "Mark as complete" button in the
  // player, the same control every other class type uses. Neither submitting
  // nor being marked may tick a class off on their behalf.
  //
  // This was wrong in two places at once: the service wrote a LessonCompletion
  // when a teacher marked, AND ChallengePlayer fired the player's
  // mark-complete handler the moment a score appeared — so a challenge
  // completed itself twice over while every other class type waited.
  const code = stripComments(read('services/ChallengeService.js'));
  assert.ok(
    !/LessonCompletion/.test(code),
    'the challenge service must never write or delete a completion',
  );

  // ...and the player must not hand the component a completion callback.
  const lessonTsx = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'components', 'course', 'player', 'PlayerLesson.jsx'),
    'utf8',
  );
  const call = lessonTsx.match(/<ChallengePlayer[^>]*\/>/);
  assert.ok(call, 'expected ChallengePlayer to be rendered');
  assert.ok(
    !/onApproved|onLessonEnded/.test(call[0]),
    'passing a completion handler would tick the class off when a mark arrives',
  );
});

test('a mark must be a whole number from 0 to 100', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  assert.match(code, /const MAX_SCORE = 100;/, 'every challenge is out of 100');
  assert.match(code, /Number\.isInteger\(value\)/, 'a fractional mark is a bug');
  assert.match(code, /value < 0 \|\| value > MAX_SCORE/, 'the range must be bounded');

  // null/undefined/'' must be rejected BEFORE coercion: Number(null) is 0, so
  // an omitted mark would otherwise be stored as a real, failing zero.
  const mark = code.slice(code.indexOf('const mark ='));
  const guardAt = mark.indexOf("score === null");
  const coerceAt = mark.indexOf('Number(score)');
  assert.ok(guardAt > -1, 'an omitted mark must be rejected explicitly');
  assert.ok(guardAt < coerceAt, 'the null guard must run before Number() coercion');

  // The route schema and the DB CHECK must agree, so a bad mark is stopped at
  // every layer rather than only the innermost one.
  const routes = stripComments(read('routes/challenge.routes.js'));
  assert.match(routes, /integer\(\)\.min\(0\)\.max\(100\)/, 'the route must bound the mark too');
});

test('0 is a real mark, never the "unmarked" sentinel', () => {
  // score is nullable precisely so 0 can mean zero. Any falsiness check
  // (!score, score || ...) would silently treat a zero as unmarked.
  const code = stripComments(read('services/ChallengeService.js'));
  assert.match(code, /r\.score == null \? null : Number\(r\.score\)/,
    'the shaper must distinguish null from 0');

  for (const rel of ['../../frontend/src/components/student/ChallengesView.tsx',
                     '../../frontend/src/components/course/player/ChallengePlayer.jsx']) {
    const ui = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.ok(
      /score != null|score == null/.test(ui),
      `${rel} must compare score against null, not falsiness`,
    );
  }
});

// --- Authorization ----------------------------------------------------------
test('both surfaces check who is asking', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  // A student may only submit to a course they can actually open...
  assert.match(code, /assertStudentCanAccess[\s\S]*?coursesForStudent/,
    'submission must reuse the same grant the player uses');
  // ...and a reviewer must actually teach the course.
  assert.match(code, /assertReviewerCanAccess/, 'review must verify the teacher');
  const submit = code.slice(code.indexOf('const submit ='), code.indexOf('const review ='));
  assert.match(submit, /assertStudentCanAccess/, 'submit must gate on student access');
});

test('an approved submission cannot be overwritten by the student', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  assert.match(
    code,
    /existing\.status === 'approved'[\s\S]*?409/,
    'overwriting an approved submission would silently revoke a granted completion',
  );
});

test('student and teacher routes mount behind different middleware', () => {
  // Sharing one router would hand students the review endpoints.
  const routes = stripComments(read('routes/challenge.routes.js'));
  assert.match(routes, /studentRouter/);
  assert.match(routes, /reviewRouter/);

  const server = stripComments(read('server.js'));
  assert.match(server, /requireStudent, challengeRoutes\.studentRouter/,
    'the submit endpoints belong behind requireStudent');
  assert.match(server, /adminOrTeacher, challengeRoutes\.reviewRouter/,
    'the review endpoints belong behind adminOrTeacher');
});

test('a student is never shown who reviewed their work', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  const shaper = code.slice(code.indexOf('const toPublic ='), code.indexOf('const mySubmission'));
  assert.match(shaper, /if \(!forStudent\)/, 'reviewer identity is withheld from students');
  assert.match(shaper, /reviewed_by/, 'reviewer identity exists for the teacher view');
});

// --- The lesson itself ------------------------------------------------------
test('a challenge is an ordinary lesson row, so curriculum features still work', () => {
  // Storing it as lesson_type='challenge' means sorting, release gating, drip
  // and the player sidebar need no parallel pipeline.
  const curriculum = stripComments(read('services/CurriculumService.js'));
  const cases = curriculum.match(/case 'challenge':/g) || [];
  assert.equal(cases.length, 2, 'both the create and update switches must accept it');
  // The external URL rides in lesson_src. Matched loosely because the case
  // grew a block body when the Expected output tab was added — what matters is
  // that lesson_src is assigned, not the brace style around it.
  assert.match(curriculum, /case 'challenge': \{[\s\S]{0,80}?data\.lesson_src = b\.lesson_src;/,
    'the external URL rides in lesson_src');
});

/**
 * The teacher dashboard queue.
 *
 * Without it a teacher had to open each course's Curriculum tab and click
 * Submissions on a hunch to discover a student was waiting — and because the
 * class stays incomplete until it is marked, an unnoticed submission blocks
 * that student indefinitely.
 */
test('the queue is scoped to the courses a teacher actually teaches', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  const scope = code.slice(code.indexOf('const courseIdsForReviewer'));

  // All three ways a teacher reaches a course must count, or a teacher
  // delegated through a batch (the normal school case) sees an empty queue.
  assert.match(scope, /user_id \|\| ''\) === me/, 'course creator counts');
  assert.match(scope, /teacher_ids/, 'a teacher named on the course counts');
  assert.match(scope, /batch_teachers/, 'a teacher attached via a batch counts');

  // An admin is unscoped; a teacher with no courses must get nothing, NOT
  // everything — an empty array must not be mistaken for "no filter".
  assert.match(scope, /actorRole === 'admin'[\s\S]*?return null/, 'admins are unscoped');
  const list = code.slice(code.indexOf('const listForTeacher'));
  assert.match(
    list,
    /courseIds && courseIds\.length === 0/,
    'a teacher with no courses must see an empty queue, not every submission',
  );
});

test('the queue surfaces unmarked work first', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  const list = code.slice(code.indexOf('const listForTeacher'));
  // Sorting by score == null (not falsiness) keeps a 0 in the marked group.
  assert.match(list, /a\.score == null \? 0 : 1/, 'unmarked sorts before marked');
  assert.match(list, /pending: shaped\.filter\(\(s\) => s\.score == null\)/,
    'the pending count must treat 0 as marked');
});

test('the dashboard queue route is literal, not a lesson id', () => {
  // '/challenges/queue' must be declared before '/challenges/:lessonId/...'
  // or Express captures "queue" as a lessonId and the numeric param validator
  // rejects it with a confusing 422.
  const routes = stripComments(read('routes/challenge.routes.js'));
  const queueAt = routes.indexOf("'/challenges/queue'");
  const paramAt = routes.indexOf("'/challenges/:lessonId/submissions'");
  assert.ok(queueAt > -1, 'the queue route must exist');
  assert.ok(queueAt < paramAt, 'the literal route must come first');
});

/**
 * The two middleware stacks expose the caller under DIFFERENT keys, and the
 * teacher/admin one is not even internally consistent:
 *
 *   requireStudent / optionalAuth → req.authUser = { userId, role }
 *   adminOrTeacher / auth         → req.user, carrying `userId` for a Supabase
 *                                   login but `id` for a local admin JWT
 *
 * Reading only req.authUser on the teacher routes left the actor undefined, so
 * courseIdsForReviewer scoped the queue to "no courses" and every teacher saw
 * an empty tab while submissions sat waiting. It failed silently — an empty
 * list looks exactly like having nothing to mark.
 */
test('the actor is resolved from whichever middleware ran', () => {
  const code = stripComments(read('controllers/ChallengeController.js'));
  const helper = code.slice(code.indexOf('const actorFrom'), code.indexOf('const namesFor'));
  assert.ok(helper, 'expected an actorFrom helper');

  assert.match(helper, /req\.authUser/, 'the student stack sets req.authUser');
  assert.match(helper, /req\.user/, 'the teacher/admin stack sets req.user');
  assert.match(helper, /u\.userId \?\? u\.id/,
    'a Supabase login carries userId while a local admin JWT carries id');

  // Every teacher/admin handler must go through it, or the bug comes back on
  // whichever one was missed.
  for (const handler of ['exports.list', 'exports.mark', 'exports.queue']) {
    const at = code.indexOf(handler);
    assert.ok(at > -1, `${handler} should exist`);
    const bodyText = code.slice(at, at + 400);
    assert.match(bodyText, /actorFrom\(req\)/,
      `${handler} must resolve the actor through actorFrom, not req.authUser alone`);
  }

  // ...and the student handlers must NOT, since req.user is unset for them.
  const submitAt = code.indexOf('exports.submit');
  assert.match(code.slice(submitAt, submitAt + 300), /req\.authUser\?\.userId/,
    'student handlers read the verified student id directly');
});

/**
 * Mount ORDER on /api/admin is load-bearing.
 *
 * Express runs the middleware of every matching app.use('/api/admin', ...) in
 * declaration order. `adminOnly` responds 403 for any role that is not
 * admin/root instead of calling next(), so it terminates the chain — a router
 * mounted AFTER it is unreachable for a teacher no matter what middleware that
 * router itself carries.
 *
 * The challenge review router was originally mounted below ~25 adminOnly
 * routes, so every teacher's dashboard queue came back empty while their
 * students' submissions sat waiting. Nothing errored: the teacher just saw
 * "Nothing waiting".
 */
test('the teacher review router is mounted above the adminOnly block', () => {
  const server = stripComments(read('server.js'));
  const lines = server.split('\n');

  const reviewAt = lines.findIndex((l) =>
    l.includes("app.use('/api/admin'") && l.includes('challengeRoutes.reviewRouter'));
  assert.ok(reviewAt > -1, 'the review router must be mounted on /api/admin');

  const firstAdminOnlyAt = lines.findIndex((l) =>
    l.includes("app.use('/api/admin'") && l.includes('adminOnly'));
  assert.ok(firstAdminOnlyAt > -1, 'expected adminOnly mounts to exist');

  assert.ok(
    reviewAt < firstAdminOnlyAt,
    `the review router is mounted at line ${reviewAt + 1}, below the first adminOnly ` +
      `mount at line ${firstAdminOnlyAt + 1} — a teacher's request is rejected before ` +
      'it ever reaches the challenge routes',
  );

  // And it must carry adminOrTeacher, not adminOnly/auth.
  assert.match(lines[reviewAt], /adminOrTeacher/,
    'the review router must admit teachers, not only admins');
});

/**
 * A teacher marking a queue of submissions needs to know WHERE each challenge
 * lives. Course + challenge title alone is ambiguous: two sessions in the same
 * course can each carry a challenge with a similar name, and the queue spans
 * every course they teach.
 *
 * The session is the `sections` row (the table kept its original name) that
 * lessons.section_id points at.
 */
test('the teacher queue reports the session each challenge belongs to', () => {
  const code = stripComments(read('services/ChallengeService.js'));
  const list = code.slice(code.indexOf('const listForTeacher'), code.indexOf('const pendingCountsByLesson'));

  assert.match(list, /section_id/, 'the lesson query must select section_id');
  assert.match(list, /Section\.findAll/, 'sessions must be resolved');
  assert.match(list, /session_title:/, 'each row must carry its session title');

  // Resolved in ONE lookup for the whole page, not per row.
  const calls = list.match(/Section\.findAll/g) || [];
  assert.equal(calls.length, 1, 'sessions must be batched, not fetched per submission');
});

test('the per-challenge view reports the session too', () => {
  // The modal header and the dashboard queue must agree about where a
  // challenge lives, or the same challenge reads differently in two places.
  const code = stripComments(read('services/ChallengeService.js'));
  const one = code.slice(code.indexOf('const listForLesson'));
  assert.match(one, /session_title:/, 'the per-lesson header must carry the session');
});

/**
 * The teacher's mark and feedback must reach the student who submitted, on the
 * card for THAT challenge — they are the whole point of the review step.
 *
 * The student shaper is a separate code path from the teacher one (it hides
 * reviewer identity), so it is easy to add a field for the teacher's view and
 * forget the student's.
 */
test('the student receives the mark, the feedback and the session', () => {
  const code = stripComments(read('services/ChallengeService.js'));

  // toPublic is shared, so score/feedback reach both views...
  const shaper = code.slice(code.indexOf('const toPublic ='), code.indexOf('const mySubmission'));
  assert.match(shaper, /score:/, 'the mark must be on every shaped submission');
  assert.match(shaper, /max_score:/, 'the student needs the scale, not just the number');
  assert.match(shaper, /feedback:/, "the teacher's words must reach the student");
  // ...but reviewer identity must NOT.
  assert.match(shaper, /if \(!forStudent\)/, 'reviewer identity stays out of the student payload');

  // The student list must attach its own submission to each challenge, and
  // name the same place the teacher's queue names.
  const list = code.slice(code.indexOf('const listForStudent'), code.indexOf('const courseIdsForReviewer'));
  assert.match(list, /submission: toPublic\(byLesson\.get\(Number\(l\.id\)\), \{ forStudent: true \}\)/,
    'each challenge carries the calling student\'s own submission');
  assert.match(list, /session_title:/, 'the student card names the session too');
  assert.equal((list.match(/Section\.findAll/g) || []).length, 1,
    'sessions must be batched, not fetched per challenge');
});

/**
 * A challenge carries two pieces of briefing material, shown to the student as
 * tabs BEFORE they open the external task:
 *
 *   Instructions    → lessons.description  (rich text)
 *   Expected output → lessons.attachment + attachment_type (image/video/url)
 *
 * Both reuse columns that already exist, so adding this needed no migration and
 * no parallel storage. attachment_type is what tells the player how to render —
 * sniffing the extension gets a YouTube link wrong, because it has none.
 */
test('a challenge stores its expected output on the existing attachment pair', () => {
  const code = stripComments(read('services/CurriculumService.js'));
  const cases = code.match(/case 'challenge': \{[\s\S]*?break;\s*\}/g) || [];
  assert.equal(cases.length, 2, 'both the create and update switches must handle it');

  for (const c of cases) {
    assert.match(c, /pickFile\(files, 'attachment'\)/, 'an uploaded output is accepted');
    assert.match(c, /expected_output_url/, 'a pasted link is accepted too');
    // The type must record WHICH, not be inferred later.
    assert.match(c, /startsWith\('video\/'\) \? 'video' : 'image'/,
      'an upload records whether it is a video or an image');
    assert.match(c, /attachment_type = 'url'/, 'a pasted link records itself as a url');
    // Neither field may be written when the admin sent nothing, or an edit
    // that only changes the title would wipe the stored output.
    assert.match(c, /if \(out\) \{[\s\S]*?\} else if \(b\.expected_output_url\)/,
      'with no file and no url, the stored output must survive an edit');
  }
});

test('the player payload carries attachment_type', () => {
  // Without it the Expected output tab cannot tell an image from a video, and
  // a pasted YouTube link has no extension to fall back on.
  const pub = stripComments(read('course-content/PublicCourseService.js'));
  assert.match(pub, /attachment_type: currentLessonRow\.attachment_type/,
    'the lesson payload must expose attachment_type');
});

/**
 * A challenge is never completed by TIME.
 *
 * PlayerController.progress auto-completes a lesson from watched seconds. A
 * challenge has no media, so totalSeconds is 0 and it fell into the "readable
 * lesson" branch — which ticks a class off after roughly ten seconds of sitting
 * on the page. The player stamps progress on open to record "last opened", so
 * this fired without the student doing anything at all.
 *
 * A quiz was already exempt for the same reason (its `duration` is a time
 * limit, not content length). Challenges belong in that exemption.
 */
test('time-based auto-completion skips quizzes and challenges', () => {
  const ctrl = stripComments(read('course-content/PlayerController.js'));

  const guard = ctrl.match(/const autoCompleteExempt = [\s\S]*?;/);
  assert.ok(guard, 'expected an explicit exemption for lesson types that never time-complete');
  assert.match(guard[0], /'quiz'/, 'a quiz completes on submission, not on elapsed time');
  assert.match(guard[0], /'challenge'/, 'a challenge completes only when the student says so');

  // The exemption must short-circuit BEFORE the dwell/percentage rules, not
  // merely be computed and then ignored.
  const at = ctrl.indexOf('if (autoCompleteExempt)');
  const dwellAt = ctrl.indexOf('const dwell =');
  assert.ok(at > -1, 'the exemption must be branched on');
  assert.ok(at < dwellAt, 'the exemption must be checked before the dwell rule');

  // The explicit "Mark as complete" endpoint must stay — it is the only way a
  // student completes a challenge now.
  assert.match(ctrl, /exports\.complete = async/, 'the manual completion endpoint must remain');
});

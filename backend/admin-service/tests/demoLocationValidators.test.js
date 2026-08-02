/**
 * Regression tests for the demo + location request validators.
 *
 * Background: these two schemas started life as generic `{name, description}` /
 * `{name, address}` placeholders under a "Generic for remaining routes" comment
 * and were never reconciled with the real models.
 *
 *  - createDemo required `name`, but the Demo model, DemoService and the admin UI
 *    all use `title`. Every "Add Demo" submit therefore failed with
 *    `Validation failed: name: "name" is required`.
 *  - createLocation allowed only `{name, address}`; `address` is not a column at
 *    all. Because validate() runs with `stripUnknown: true`, the real fields
 *    (city/state/pin/photo_url/map_url/is_new/sort_order) were silently DROPPED
 *    before reaching LocationService — a save that looked successful but lost data.
 *
 * The payloads below mirror exactly what the admin forms submit, so these tests
 * fail against the old stubs and guard both routes from regressing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { schemas } = require('../src/lib/validators');

// Same options validateBody() uses — stripUnknown matters here.
const check = (schema, body) =>
  schema.validate(body, { stripUnknown: true, abortEarly: false });

// ---------------------------------------------------------------------------
// Demos
// ---------------------------------------------------------------------------
test('createDemo accepts the exact payload the Add Demo form sends', () => {
  const { error, value } = check(schemas.createDemo, {
    title: 'Free Arduino Demo',
    course_id: null,
    start_at: null,
    end_at: null,
    teacher_ids: [],
    meeting_link: null,
    status: '1',
  });
  assert.equal(error, undefined, error && error.message);
  assert.equal(value.title, 'Free Arduino Demo');
});

test('createDemo requires title (and no longer requires name)', () => {
  const { error } = check(schemas.createDemo, { course_id: '1' });
  assert.ok(error, 'a demo with no title must be rejected');
  const fields = error.details.map((d) => d.path.join('.'));
  assert.ok(fields.includes('title'), 'title must be the missing field');
  assert.ok(!fields.includes('name'), '`name` must no longer be part of this schema');
});

test('createDemo preserves every scheduling field (stripUnknown must not eat them)', () => {
  const start = new Date('2026-08-01T10:00:00.000Z').toISOString();
  const end = new Date('2026-08-01T11:00:00.000Z').toISOString();
  const { error, value } = check(schemas.createDemo, {
    title: 'Robotics Demo',
    course_id: '12',
    start_at: start,
    end_at: end,
    teacher_ids: ['VRT202600001', 'VRT202600002'],
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    status: '0',
  });
  assert.equal(error, undefined, error && error.message);
  assert.equal(value.course_id, '12');
  assert.deepEqual(value.teacher_ids, ['VRT202600001', 'VRT202600002']);
  assert.equal(value.meeting_link, 'https://meet.google.com/abc-defg-hij');
  assert.ok(value.start_at instanceof Date);
  assert.ok(value.end_at instanceof Date);
  for (const k of ['course_id', 'start_at', 'end_at', 'teacher_ids', 'meeting_link']) {
    assert.ok(k in value, `${k} must survive validation`);
  }
});

test('createDemo accepts teacher_ids as a CSV/JSON string (multipart clients)', () => {
  const csv = check(schemas.createDemo, { title: 'Demo', teacher_ids: 'a,b' });
  assert.equal(csv.error, undefined, csv.error && csv.error.message);
  const json = check(schemas.createDemo, { title: 'Demo', teacher_ids: '["a","b"]' });
  assert.equal(json.error, undefined, json.error && json.error.message);
});

test('createDemo rejects a malformed meeting link', () => {
  const { error } = check(schemas.createDemo, { title: 'Demo', meeting_link: 'not-a-url' });
  assert.ok(error, 'a non-URL meeting link must be rejected');
});

test('updateDemo allows a partial edit', () => {
  const { error, value } = check(schemas.updateDemo, { title: 'Renamed demo' });
  assert.equal(error, undefined, error && error.message);
  assert.deepEqual(value, { title: 'Renamed demo' });
});

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
test('createLocation keeps every real centre field', () => {
  const { error, value } = check(schemas.createLocation, {
    name: 'Guntur Centre',
    city: 'Guntur',
    state: 'AP',
    pin: '522001',
    photo_url: 'https://cdn.example/a.png',
    map_url: 'https://maps.google.com/x',
    is_new: '1',
    sort_order: 3,
    status: '1',
  });
  assert.equal(error, undefined, error && error.message);
  for (const k of ['city', 'state', 'pin', 'photo_url', 'map_url', 'is_new', 'sort_order']) {
    assert.ok(k in value, `${k} must survive validation (was silently stripped before)`);
  }
  assert.equal(value.city, 'Guntur');
  assert.equal(value.pin, '522001');
});

test('createLocation accepts the form default of blank optional fields', () => {
  const { error } = check(schemas.createLocation, {
    name: 'Guntur Centre',
    city: '', state: '', pin: '', photo_url: '', map_url: '',
    is_new: '0', sort_order: 0, status: '1',
  });
  assert.equal(error, undefined, error && error.message);
});

test('createLocation still requires name', () => {
  const { error } = check(schemas.createLocation, { city: 'Guntur' });
  assert.ok(error, 'a location with no name must be rejected');
  assert.ok(error.details.map((d) => d.path.join('.')).includes('name'));
});

test('`address` is gone — it was never a Location column', () => {
  // Supplying the old bogus field must not make it into the validated output.
  const { error, value } = check(schemas.createLocation, {
    name: 'Guntur Centre',
    address: '1-2-3 Main Road',
  });
  assert.equal(error, undefined, error && error.message);
  assert.ok(!('address' in value), 'address must be stripped, not persisted');
});

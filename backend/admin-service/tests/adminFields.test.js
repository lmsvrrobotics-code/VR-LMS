// Tests that the admin Add/Edit schemas carry through every field the form
// posts.
//
// The bug: createAdmin/updateAdmin declared only name, email and phone, but
// validate() runs with stripUnknown, so joi silently deleted the rest. No
// validation error was raised — the fields simply vanished between the
// middleware and the service. AdminService.create then hit its own
// `if (!body.password)` guard and returned 422 "Name, email, and password are
// required" for a form that plainly had a password in it, which is what made
// adding a new admin impossible. On update the same strip quietly dropped
// password changes and the entire profile (about, address, college_id,
// socials) while still reporting success.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validate, schemas } = require('../src/lib/validators');

// Mirrors the payload AdminForm.jsx builds for a new admin.
const createBody = () => ({
    name: 'New Admin',
    email: 'new.admin@example.com',
    password: 'secret123',
    phone: '9876543210',
    about: 'Runs the robotics lab',
    address: '221B Baker Street',
    college_name: 'VR Robotics',
    college_id: 'CLG-1',
    facebook: 'facebook.com/vr',
    twitter: 'twitter.com/vr',
    website: 'vrroboticsacademy.com',
    linkedin: 'linkedin.com/in/vr',
});

const pass = (schema, data) => {
    const { error, value } = validate(data, schema);
    assert.equal(error, undefined, `expected the schema to accept this input: ${error && error.message}`);
    return value;
};

test('createAdmin: the password reaches the service instead of being stripped', () => {
    const value = pass(schemas.createAdmin, createBody());
    assert.equal(value.password, 'secret123');
});

test('createAdmin: a valid submission is accepted whole', () => {
    const body = createBody();
    const value = pass(schemas.createAdmin, body);
    for (const key of Object.keys(body)) {
        assert.ok(key in value, `${key} was dropped before the service saw it`);
    }
});

test('createAdmin: the profile fields survive validation', () => {
    const value = pass(schemas.createAdmin, createBody());
    assert.equal(value.about, 'Runs the robotics lab');
    assert.equal(value.address, '221B Baker Street');
    assert.equal(value.college_id, 'CLG-1');
    assert.equal(value.linkedin, 'linkedin.com/in/vr');
});

test('createAdmin: an empty college_id is preserved, not rejected', () => {
    // The form always sends the key; '' means "not a school admin".
    const value = pass(schemas.createAdmin, { ...createBody(), college_id: '' });
    assert.equal(value.college_id, '');
});

test('createAdmin: a bare social URL with no scheme is accepted', () => {
    const value = pass(schemas.createAdmin, { ...createBody(), website: 'vrroboticsacademy.com' });
    assert.equal(value.website, 'vrroboticsacademy.com');
});

test('createAdmin: a password is still required', () => {
    const body = createBody();
    delete body.password;
    const { error } = validate(body, schemas.createAdmin);
    assert.ok(error, 'a missing password should be rejected by the schema');
});

test('createAdmin: a short password is rejected by the schema, not by the service', () => {
    const { error } = validate({ ...createBody(), password: 'short' }, schemas.createAdmin);
    assert.ok(error);
    assert.match(error.message, /password/i);
});

test('updateAdmin: a password change is carried through', () => {
    const value = pass(schemas.updateAdmin, { name: 'Admin', email: 'a@b.com', password: 'newsecret1' });
    assert.equal(value.password, 'newsecret1');
});

test('updateAdmin: a blank password is allowed and means "keep the current one"', () => {
    const value = pass(schemas.updateAdmin, { name: 'Admin', email: 'a@b.com', password: '' });
    assert.equal(value.password, '');
});

test('updateAdmin: profile edits are not silently discarded', () => {
    const value = pass(schemas.updateAdmin, {
        name: 'Admin',
        email: 'a@b.com',
        about: 'Updated bio',
        address: 'New address',
        college_id: 'CLG-2',
    });
    assert.equal(value.about, 'Updated bio');
    assert.equal(value.address, 'New address');
    assert.equal(value.college_id, 'CLG-2');
});

test('updateAdmin: clearing college_id is distinguishable from omitting it', () => {
    const cleared = pass(schemas.updateAdmin, { name: 'Admin', email: 'a@b.com', college_id: '' });
    assert.equal(cleared.college_id, '', 'an empty string must survive so the service can null it');

    const untouched = pass(schemas.updateAdmin, { name: 'Admin', email: 'a@b.com' });
    assert.equal('college_id' in untouched, false, 'an absent key must stay absent so the service leaves it alone');
});

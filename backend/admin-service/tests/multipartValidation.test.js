// Regression tests for the multer/validateBody middleware ordering bug.
//
// Every admin route that accepts an image posts multipart/form-data. Only multer
// parses that content type (express.json/urlencoded ignore it), so upload.single()
// MUST run before validateBody() — with the order reversed the validator saw an
// empty req.body and rejected EVERY create/update with 400 "Validation failed",
// which is exactly what broke Create Teacher.
//
// These drive the real middleware chain over a real HTTP socket with a real
// multipart body; the controller is stubbed so no DB/Supabase is touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const upload = require('../src/middlewares/multer');
const { validateBody, schemas } = require('../src/lib/validators');

// Spin up an app exposing the same chain teacher.routes.js uses, capturing what
// the controller actually receives.
const listen = (middlewares) => {
    const app = express();
    app.use(express.json());
    const seen = {};
    app.post('/t', ...middlewares, (req, res) => {
        seen.body = req.body;
        seen.validatedBody = req.validatedBody;
        seen.file = req.file;
        res.status(201).json({ ok: true });
    });
    return new Promise((resolve) => {
        const server = app.listen(0, () => resolve({ server, seen, port: server.address().port }));
    });
};

const postMultipart = async (port, fields) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch(`http://127.0.0.1:${port}/t`, { method: 'POST', body: form });
    return { status: res.status, json: await res.json().catch(() => null) };
};

const VALID_TEACHER = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'supersecret123',
    expertise: 'AI, ML',
    yearsOfExperience: '7',
    bio: 'Teaches analytical engines.',
};

test('createTeacher: multipart body passes validation when upload runs first', async () => {
    const { server, seen, port } = await listen([
        upload.single('photo'),
        validateBody(schemas.createTeacher),
    ]);
    try {
        const { status } = await postMultipart(port, VALID_TEACHER);
        // The bug produced 400 here on every request, regardless of payload.
        assert.equal(status, 201);
        assert.equal(seen.body.name, 'Ada Lovelace');
        assert.equal(seen.body.email, 'ada@example.com');
    } finally {
        server.close();
    }
});

test('REGRESSION: validateBody before upload.single 400s even on a valid payload', async () => {
    // Pins the actual defect: with the old ordering req.body is {} at validation
    // time, so required fields "fail" no matter what the client sent.
    const { server, port } = await listen([
        validateBody(schemas.createTeacher),
        upload.single('photo'),
    ]);
    try {
        const { status, json } = await postMultipart(port, VALID_TEACHER);
        assert.equal(status, 400);
        assert.equal(json.error, 'Validation failed');
        // It complains the fields are missing — they were merely unparsed.
        const failed = json.details.map((d) => d.field).sort();
        assert.deepEqual(failed, ['email', 'name', 'password']);
    } finally {
        server.close();
    }
});

test('createTeacher: password survives stripUnknown and reaches the service', async () => {
    // stripUnknown drops undeclared keys from validatedBody. password must be
    // declared, or admin-created teachers get no Supabase login.
    const { server, seen, port } = await listen([
        upload.single('photo'),
        validateBody(schemas.createTeacher),
    ]);
    try {
        const { status } = await postMultipart(port, VALID_TEACHER);
        assert.equal(status, 201);
        assert.equal(seen.validatedBody.password, 'supersecret123');
        assert.equal(seen.validatedBody.expertise, 'AI, ML');
        assert.equal(seen.validatedBody.yearsOfExperience, 7); // coerced to number
    } finally {
        server.close();
    }
});

test('createTeacher: a short password is still rejected', async () => {
    const { server, port } = await listen([
        upload.single('photo'),
        validateBody(schemas.createTeacher),
    ]);
    try {
        const { status, json } = await postMultipart(port, { ...VALID_TEACHER, password: 'short' });
        assert.equal(status, 400);
        assert.ok(json.details.some((d) => d.field === 'password'));
    } finally {
        server.close();
    }
});

test('createTeacher: a genuinely missing required field is still rejected', async () => {
    // Guards against "fixing" the 400 by loosening the schema into a no-op.
    const { server, port } = await listen([
        upload.single('photo'),
        validateBody(schemas.createTeacher),
    ]);
    try {
        const { name, ...noName } = VALID_TEACHER;
        const { status, json } = await postMultipart(port, noName);
        assert.equal(status, 400);
        assert.ok(json.details.some((d) => d.field === 'name'));
    } finally {
        server.close();
    }
});

test('createTeacher: a scheme-less linkedinUrl is accepted', async () => {
    // The UI field is free text with no scheme enforcement, so a strict URI
    // rule here would 400 an optional field on a plausible entry.
    const { server, port } = await listen([
        upload.single('photo'),
        validateBody(schemas.createTeacher),
    ]);
    try {
        const { status } = await postMultipart(port, {
            ...VALID_TEACHER,
            linkedinUrl: 'linkedin.com/in/ada',
        });
        assert.equal(status, 201);
    } finally {
        server.close();
    }
});

test('updateTeacher: a blank password is allowed (keep current)', async () => {
    const { server, seen, port } = await listen([
        upload.single('photo'),
        validateBody(schemas.updateTeacher),
    ]);
    try {
        const { status } = await postMultipart(port, {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            password: '',
        });
        assert.equal(status, 201);
        assert.equal(seen.validatedBody.password, '');
    } finally {
        server.close();
    }
});

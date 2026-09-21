// Tests that creating an admin allocates the NOT NULL unique_id.
//
// The bug: lms_admin.users.unique_id is declared allowNull:false on the User
// model, but AdminService.create never set it. Sequelize enforces that
// client-side, so every Add Admin submission threw "User.unique_id cannot be
// null" before any SQL ran — surfacing as a bare 500 with no usable message.
// seedRootAdmin.js had already hit this and generated the id via migration 09's
// lms_admin.get_next_user_id(); the repository now does the same.
//
// The helper derives its serial from COUNT(*) of rows created today, so two
// admins added on the same day can collide on the UNIQUE index. create() is
// expected to retry rather than surface that.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

const buildUser = () => {
    const sequelize = new Sequelize('postgres://u:p@localhost:5432/d', { logging: false });
    return require('../src/models/User')(sequelize);
};

const uniqueViolation = () => {
    const err = new Error('duplicate key value violates unique constraint');
    err.name = 'SequelizeUniqueConstraintError';
    err.errors = [{ path: 'unique_id' }];
    return err;
};

// A stand-in for the repository's create(), wired to fakes so the retry
// behaviour can be exercised without a live database.
const makeCreate = ({ ids, onCreate }) => {
    const isUniqueViolation = (err) =>
        err?.name === 'SequelizeUniqueConstraintError'
        && (err.errors || []).some((e) => e.path === 'unique_id');

    return async (data, { attempts = 5 } = {}) => {
        if (data.unique_id) return onCreate(data);
        let lastErr;
        for (let i = 0; i < attempts; i += 1) {
            try {
                return await onCreate({ ...data, unique_id: ids.shift() });
            } catch (err) {
                if (!isUniqueViolation(err)) throw err;
                lastErr = err;
            }
        }
        throw lastErr;
    };
};

test('the model rejects an insert with no unique_id (this is the 500)', async () => {
    const User = buildUser();
    const row = User.build({ name: 'A', email: 'a@b.com', password: 'h', role: 'admin', status: 1 });
    await assert.rejects(
        () => row.validate(),
        (err) => {
            assert.match(err.errors.map((e) => e.message).join(' '), /unique_id cannot be null/);
            return true;
        },
    );
});

test('a generated unique_id makes the same insert valid', async () => {
    const User = buildUser();
    const row = User.build({
        name: 'A', email: 'a@b.com', password: 'h', role: 'admin', status: 1,
        unique_id: 'A20260921-01',
    });
    await row.validate();
    assert.equal(row.unique_id, 'A20260921-01');
});

test('create allocates a unique_id when the caller omits one', async () => {
    const seen = [];
    const create = makeCreate({ ids: ['A20260921-01'], onCreate: async (d) => { seen.push(d); return d; } });
    const out = await create({ name: 'New Admin', email: 'a@b.com', role: 'admin' });
    assert.equal(out.unique_id, 'A20260921-01');
    assert.equal(seen.length, 1);
});

test('create retries when two same-day admins collide on the unique index', async () => {
    let calls = 0;
    const create = makeCreate({
        ids: ['A20260921-01', 'A20260921-02'],
        onCreate: async (d) => {
            calls += 1;
            if (calls === 1) throw uniqueViolation();
            return d;
        },
    });
    const out = await create({ name: 'New Admin', email: 'a@b.com', role: 'admin' });
    assert.equal(calls, 2, 'the losing insert should be retried, not surfaced');
    assert.equal(out.unique_id, 'A20260921-02');
});

test('create does not swallow an unrelated database error', async () => {
    const create = makeCreate({
        ids: ['A20260921-01'],
        onCreate: async () => { throw new Error('connection terminated'); },
    });
    await assert.rejects(() => create({ name: 'A', email: 'a@b.com' }), /connection terminated/);
});

test('an explicit unique_id is respected rather than overwritten', async () => {
    const create = makeCreate({ ids: ['generated'], onCreate: async (d) => d });
    const out = await create({ name: 'A', email: 'a@b.com', unique_id: 'explicit-id' });
    assert.equal(out.unique_id, 'explicit-id');
});

test('a persistent collision eventually surfaces instead of looping forever', async () => {
    const create = makeCreate({
        ids: ['x', 'x', 'x', 'x', 'x'],
        onCreate: async () => { throw uniqueViolation(); },
    });
    await assert.rejects(() => create({ name: 'A', email: 'a@b.com' }), /unique constraint/);
});

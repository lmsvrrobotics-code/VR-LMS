const authDb = require('../config/authDatabase');
const { QueryTypes } = require('sequelize');

// Brand-scoped public identifier for students and teachers.
//
//   VRS202600001
//   ││ │   └──── 5-digit sequential number, per year AND per role
//   ││ └──────── registration year (4 digits)
//   │└────────── S = student, T = teacher
//   └─────────── VR = brand
//
// The serial resets to 00001 each calendar year and is counted separately for
// students and teachers, so VRS2026 00001 and VRT2026 00001 both exist.
//
// NOT every account has one: a self-signup student stays unique_id = NULL until
// an admin converts their lead (LeadService.convert). Admin-created students and
// teachers get one immediately.

const BRAND = 'VR';
const ROLE_CODE = { student: 'S', teacher: 'T' };
const SERIAL_WIDTH = 5;

const prefixFor = (role, year) => {
    const code = ROLE_CODE[role];
    if (!code) throw new Error(`unique_id: unsupported role "${role}"`);
    return `${BRAND}${code}${year}`;
};

// Pure format helpers — the id rules live here, free of any DB access, so they
// can be unit-tested directly (tests/uniqueId.test.js).

// Build the id for a known serial. Serials beyond the 5-digit width are NOT
// truncated: padStart only pads, so a 6-digit serial widens the id rather than
// silently colliding with an existing one.
const format = (role, year, serial) => `${prefixFor(role, year)}${String(serial).padStart(SERIAL_WIDTH, '0')}`;

// Split an id back into its parts, or null when it doesn't match the format.
const parse = (id) => {
    const m = /^VR([ST])(\d{4})(\d{5,})$/.exec(String(id || ''));
    if (!m) return null;
    const role = m[1] === 'S' ? 'student' : 'teacher';
    return { role, year: Number(m[2]), serial: Number(m[3]) };
};

// Next serial given the highest existing id for a prefix (null/garbage → 1).
const nextSerial = (lastId, prefix) => {
    if (!lastId) return 1;
    const tail = Number(String(lastId).slice(prefix.length));
    return (Number.isFinite(tail) ? tail : 0) + 1;
};

// Derive the next serial by reading the highest existing id for this
// prefix rather than COUNT(*) — COUNT breaks permanently once any row is
// deleted (it would re-issue an id that already exists).
//
// Concurrency: the caller must hold a transaction and the column must carry a
// UNIQUE index. Two racing signups can read the same MAX and build the same id;
// the unique index then rejects the loser, and `generate` retries. That keeps
// correctness in the DB rather than trusting a read-then-write gap.
const nextIdForPrefix = async (prefix, tx = null) => {
    const rows = await authDb.query(
        `SELECT unique_id
           FROM users
          WHERE unique_id LIKE :like
          ORDER BY unique_id DESC
          LIMIT 1`,
        {
            replacements: { like: `${prefix}%` },
            type: QueryTypes.SELECT,
            transaction: tx,
        },
    );

    // Serial is the fixed-width tail after the prefix. nextSerial parses
    // defensively so a malformed legacy row can't wedge generation for everyone.
    const next = nextSerial(rows[0]?.unique_id, prefix);
    return `${prefix}${String(next).padStart(SERIAL_WIDTH, '0')}`;
};

// Generate the next free id for a role. `year` defaults to the current
// registration year. Retries on the unique-index collision a concurrent caller
// can cause; the loser simply takes the next serial.
const generate = async (role, { tx = null, year = new Date().getFullYear(), attempts = 5 } = {}) => {
    const prefix = prefixFor(role, year);
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
        const candidate = await nextIdForPrefix(prefix, tx);
        const taken = await authDb.query(
            'SELECT 1 FROM users WHERE unique_id = :id LIMIT 1',
            { replacements: { id: candidate }, type: QueryTypes.SELECT, transaction: tx },
        );
        if (!taken.length) return candidate;
        lastErr = new Error(`unique_id: ${candidate} already taken`);
    }
    throw lastErr || new Error('unique_id: could not allocate an id');
};

module.exports = {
    generate,
    prefixFor,
    format,
    parse,
    nextSerial,
    BRAND,
    ROLE_CODE,
    SERIAL_WIDTH,
};

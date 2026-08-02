const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

// Brand-scoped, human-readable identifier for batches.
//
//   VR-B-00001
//   ││ │ └──── 5-digit running serial (global, not reset)
//   ││ └────── B = Batch
//   └┴──────── VR = brand
//
// Mirrors the student/teacher scheme in ./uniqueId.js, but batches are a single
// global series — there's no per-year or per-role split — so the prefix is the
// fixed string "VR-B-".
//
// The serial is derived from the highest EXISTING id, never COUNT(*): a
// count-based serial re-issues a live id the moment any batch is deleted, and
// the primary-key/unique index then rejects every subsequent create. See
// tests/batchId.test.js for the rules pinned against a later "cleanup".

const BRAND = 'VR';
const KIND = 'B';
const PREFIX = `${BRAND}-${KIND}-`; // "VR-B-"
const SERIAL_WIDTH = 5;

// Pure format helpers — the id rules live here, free of any DB access, so they
// can be unit-tested directly (tests/batchId.test.js).

// Build the id for a known serial. Serials beyond the 5-digit width are NOT
// truncated: padStart only pads, so a 6-digit serial widens the id (VR-B-100000)
// rather than silently colliding with an existing one.
const format = (serial) => `${PREFIX}${String(serial).padStart(SERIAL_WIDTH, '0')}`;

// Split an id back into its serial, or null when it doesn't match the format.
const parse = (id) => {
    const m = /^VR-B-(\d{5,})$/.exec(String(id || ''));
    if (!m) return null;
    return { serial: Number(m[1]) };
};

// Next serial given the highest existing id for the prefix (null/garbage → 1).
const nextSerial = (lastId) => {
    if (!lastId) return 1;
    const parsed = parse(lastId);
    return (parsed ? parsed.serial : 0) + 1;
};

// Read the highest existing VR-B- id and return the next candidate. Ordering by
// unique_id DESC works because the fixed-width, zero-padded tail sorts
// lexicographically the same as numerically (VR-B-00009 < VR-B-00010). Once the
// serial widens past 5 digits that stops holding, so cast the tail and take the
// real MAX instead of trusting string order.
const nextIdFromDb = async (tx = null) => {
    const rows = await sequelize.query(
        `SELECT unique_id
           FROM batches
          WHERE unique_id LIKE :like
          ORDER BY LENGTH(unique_id) DESC, unique_id DESC
          LIMIT 1`,
        {
            replacements: { like: `${PREFIX}%` },
            type: QueryTypes.SELECT,
            transaction: tx,
        },
    );
    return format(nextSerial(rows[0]?.unique_id));
};

// Generate the next free batch id. Retries on the unique/PK collision a
// concurrent create can cause; the loser simply takes the next serial. The
// caller should ideally hold a transaction so the read-then-write gap is closed
// by the DB's unique constraint rather than trusted in app code.
const generate = async ({ tx = null, attempts = 5 } = {}) => {
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
        const candidate = await nextIdFromDb(tx);
        const taken = await sequelize.query(
            'SELECT 1 FROM batches WHERE unique_id = :id LIMIT 1',
            { replacements: { id: candidate }, type: QueryTypes.SELECT, transaction: tx },
        );
        if (!taken.length) return candidate;
        lastErr = new Error(`batchId: ${candidate} already taken`);
    }
    throw lastErr || new Error('batchId: could not allocate an id');
};

module.exports = {
    generate,
    format,
    parse,
    nextSerial,
    BRAND,
    KIND,
    PREFIX,
    SERIAL_WIDTH,
};

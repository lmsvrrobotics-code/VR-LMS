// Load-behaviour tests for the shared cache (config/cache.js).
//
// These target the two things that break under real concurrency:
//   1. cache stampede — every concurrent miss on a hot key running fn() at once
//   2. KEYS-based invalidation blocking Redis
//
// They run WITHOUT Redis (REDIS_URL unset in CI), which is the honest worst
// case: get/set no-op, so nothing but single-flight can suppress duplicate
// fn() calls. If these pass with the cache disabled, the coalescing is real
// and not an artifact of a warm Redis.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../src/config/cache');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('wrap: 5000 concurrent misses on one key run fn() exactly once', async () => {
    // The leaderboard/catalog scenario. Pre-fix each of these would have launched
    // its own full-table aggregation the instant the TTL lapsed.
    let calls = 0;
    const expensiveQuery = async () => {
        calls += 1;
        await sleep(50); // stand-in for the aggregate scan
        return { leaderboard: ['ada'] };
    };

    const results = await Promise.all(
        Array.from({ length: 5000 }, () => cache.wrap('lb:rows:overall', 120, expensiveQuery)),
    );

    assert.equal(calls, 1, `expected 1 DB call, got ${calls} (cache stampede)`);
    assert.equal(results.length, 5000);
    // Every caller must get the real value, not undefined/a placeholder.
    for (const r of results) assert.deepEqual(r, { leaderboard: ['ada'] });
});

test('wrap: distinct keys are not coalesced together', async () => {
    // Single-flight must be per-key — collapsing different keys would serve
    // one endpoint's data to another.
    const calls = {};
    const fnFor = (name) => async () => {
        calls[name] = (calls[name] || 0) + 1;
        await sleep(20);
        return name;
    };

    const [a, b] = await Promise.all([
        Promise.all(Array.from({ length: 50 }, () => cache.wrap('pub:books', 30, fnFor('books')))),
        Promise.all(Array.from({ length: 50 }, () => cache.wrap('pub:kits', 30, fnFor('kits')))),
    ]);

    assert.equal(calls.books, 1);
    assert.equal(calls.kits, 1);
    assert.ok(a.every((v) => v === 'books'));
    assert.ok(b.every((v) => v === 'kits'));
});

test('wrap: a later call re-computes (the in-flight entry is not a cache)', async () => {
    // Coalescing must only last for the duration of the flight. With Redis off,
    // a subsequent call has to hit fn() again — otherwise we would be silently
    // caching forever in process memory and never seeing fresh data.
    let calls = 0;
    const fn = async () => { calls += 1; return calls; };

    await cache.wrap('pub:gallery', 30, fn);
    await cache.wrap('pub:gallery', 30, fn);

    assert.equal(calls, 2);
});

test('wrap: a rejected fn() does not poison the key', async () => {
    // A transient DB error must not wedge the key into a permanently-failing
    // in-flight promise that every later request awaits.
    let calls = 0;
    const flaky = async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient DB error');
        return 'recovered';
    };

    await assert.rejects(
        Promise.all([
            cache.wrap('pub:catalog', 30, flaky),
            cache.wrap('pub:catalog', 30, flaky),
        ]),
        /transient DB error/,
    );

    // The next request must be able to succeed.
    assert.equal(await cache.wrap('pub:catalog', 30, flaky), 'recovered');
});

test('wrap: all callers see the error when the shared flight fails', async () => {
    // Coalesced callers share one promise, so they must share its rejection
    // rather than hanging or silently receiving undefined.
    const fn = async () => { await sleep(10); throw new Error('boom'); };
    const settled = await Promise.allSettled(
        Array.from({ length: 20 }, () => cache.wrap('pub:locations', 30, fn)),
    );
    assert.equal(settled.length, 20);
    assert.ok(settled.every((s) => s.status === 'rejected' && /boom/.test(s.reason.message)));
});

test('del: pattern invalidation never uses the blocking KEYS command', async () => {
    // KEYS is O(N) over the whole keyspace and blocks single-threaded Redis for
    // its full duration; one admin write would stall every concurrent read. Assert
    // against the client contract: SCAN is used, KEYS is never called.
    const client = cache.getClient();
    if (!client) {
        // No Redis configured (CI): del() no-ops, nothing to assert.
        assert.equal(await cache.del('pub:*'), undefined);
        return;
    }
    const calls = [];
    const origKeys = client.keys.bind(client);
    const origScan = client.scan.bind(client);
    client.keys = async (...a) => { calls.push('keys'); return origKeys(...a); };
    client.scan = async (...a) => { calls.push('scan'); return origScan(...a); };
    try {
        await cache.del('pub:*');
        assert.ok(!calls.includes('keys'), 'del() must not call the blocking KEYS command');
        assert.ok(calls.includes('scan'), 'del() should invalidate via SCAN');
    } finally {
        client.keys = origKeys;
        client.scan = origScan;
    }
});

// Optional Redis cache (Upstash). GRACEFUL BY DESIGN: if REDIS_URL is unset or
// Redis is unreachable, every call no-ops and the request still works — caching
// must never break the app. Used to shield Postgres from hot reads at scale
// (leaderboard, catalog, etc.).
const Redis = require('ioredis');

const url = process.env.REDIS_URL || '';
let client = null;
let ready = false;
let loggedErr = false;

if (url) {
    try {
        client = new Redis(url, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false, // fail fast instead of hanging when down
            connectTimeout: 5000,
            tls: url.startsWith('rediss://') ? {} : undefined,
        });
        client.on('ready', () => { ready = true; console.log('[cache] Redis connected'); });
        client.on('end', () => { ready = false; });
        client.on('error', (e) => {
            ready = false;
            if (!loggedErr) { console.warn('[cache] Redis error (caching disabled until reconnect):', e.message); loggedErr = true; }
        });
    } catch (e) {
        console.warn('[cache] init failed — caching disabled:', e.message);
        client = null;
    }
} else {
    console.warn('[cache] REDIS_URL not set — caching disabled (app still works)');
}

const get = async (key) => {
    if (!client || !ready) return null;
    try {
        const v = await client.get(key);
        return v ? JSON.parse(v) : null;
    } catch { return null; }
};

const set = async (key, value, ttlSeconds) => {
    if (!client || !ready || value === undefined || value === null) return;
    try { await client.set(key, JSON.stringify(value), 'EX', Math.max(1, Number(ttlSeconds) || 60)); }
    catch { /* ignore */ }
};

// Delete keys by exact key or a glob pattern (used for invalidation on writes).
//
// Pattern deletes use SCAN, never KEYS. KEYS is O(N) over the whole keyspace and
// blocks Redis (single-threaded) for its entire duration — one admin write would
// stall every concurrent cache read. SCAN walks the keyspace in small cursor
// batches, so other commands interleave.
const del = async (keyOrPattern) => {
    if (!client || !ready) return;
    try {
        if (keyOrPattern.includes('*')) {
            let cursor = '0';
            do {
                const [next, keys] = await client.scan(cursor, 'MATCH', keyOrPattern, 'COUNT', 100);
                cursor = next;
                if (keys.length) await client.unlink(...keys).catch(() => client.del(...keys));
            } while (cursor !== '0');
        } else {
            await client.del(keyOrPattern);
        }
    } catch { /* ignore */ }
};

// In-flight computations, keyed by cache key. Single-flight (a.k.a. request
// coalescing) — see wrap().
const inflight = new Map();

// Cache-aside with single-flight.
//
// The naive check-then-compute has a cache-stampede bug: the moment a hot key
// expires, EVERY concurrent request misses and they all run fn() at once. For
// the leaderboard / public catalog that means thousands of simultaneous full
// table scans against a 20-connection pool — the pool saturates, acquires queue,
// and the whole service stalls. Expiry synchronises the herd, so the cache made
// the spike worse rather than better.
//
// Here the first miss for a key stores its pending promise; concurrent callers
// await that same promise instead of launching their own fn(). N requests → 1
// query. Note this coalesces per-process; with multiple replicas you get one
// query per replica, not one globally, which is the intended trade (no cross-
// process lock, no added failure mode). Caching stays optional: with Redis down,
// get/set no-op and this degrades to plain single-flight over the DB, which is
// still strictly better than an unbounded herd.
const wrap = async (key, ttlSeconds, fn) => {
    const cached = await get(key);
    if (cached !== null) return cached;

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
        const fresh = await fn();
        await set(key, fresh, ttlSeconds);
        return fresh;
    })();

    // Registered before any await above yields, so concurrent callers in the
    // same tick see it. Always cleared — a rejected fn() must not poison the key.
    inflight.set(key, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(key);
    }
};

const isEnabled = () => Boolean(client);

// Raw ioredis handle for consumers that need it directly (e.g. a shared
// rate-limit store across replicas). May be null when REDIS_URL is unset —
// callers MUST treat null as "no Redis" and fall back gracefully.
const getClient = () => client;

module.exports = { get, set, del, wrap, isEnabled, getClient };

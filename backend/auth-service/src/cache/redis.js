import Redis from 'redis';

let redisClient = null;

// Caching is optional here — every consumer falls back to a direct DB query. So
// a Redis outage must stay quiet and bounded rather than turning into an
// infinite reconnect loop that floods stderr.
//
// Give up after this many consecutive failed attempts. node-redis retries
// forever if the strategy never returns an Error, and each attempt re-emits
// 'error'; with the old 500ms cap that was ~2 reconnects/sec, each logging a
// full AggregateError with two stack traces, for the entire life of the
// process. Ten attempts over ~5s is enough to ride out a restarting Redis
// without the log becoming the outage.
const MAX_RECONNECT_ATTEMPTS = 10;

// node-redis re-emits 'error' on every reconnect attempt. Log at most one line
// per minute so the condition is visible without burying every other signal.
const ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * @param deps overrides for testing: `createClient` swaps the redis factory so
 *             tests need no live server. Production callers pass nothing.
 */
export async function initRedis(deps = {}) {
  if (redisClient) return redisClient;

  const createClient = deps.createClient ?? Redis.createClient;
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  const client = createClient({
    url: REDIS_URL,
    socket: {
      // Returning an Error stops node-redis retrying and puts the client in a
      // terminal state instead of looping forever against a socket that isn't
      // coming back.
      reconnectStrategy: (retries) => {
        if (retries >= MAX_RECONNECT_ATTEMPTS) {
          return new Error('redis-unavailable');
        }
        return Math.min(retries * 50, 500);
      },
      // Don't let a hung connect attempt stall service startup.
      connectTimeout: 3000,
    },
    legacyMode: false,
  });

  // MUST be attached before connect(): an 'error' event with no listener is an
  // unhandled 'error' on an EventEmitter, which would crash the auth service.
  let lastErrorLog = 0;
  let suppressedErrors = 0;
  client.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLog > ERROR_LOG_INTERVAL_MS) {
      lastErrorLog = now;
      const extra = suppressedErrors ? ` (${suppressedErrors} similar suppressed)` : '';
      suppressedErrors = 0;
      // Log the message, not the object: the full AggregateError carries a
      // stack trace per address family and is ~25 lines per occurrence.
      console.warn(
        `⚠️  Redis unavailable: ${err.message || err.code || 'connection error'}${extra} — ` +
          'caching disabled, queries go direct to DB.',
      );
    } else {
      suppressedErrors += 1;
    }
  });

  client.on('ready', () => {
    console.log('✅ Redis connected');
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn(
      `⚠️  Redis unavailable (${err.message}) — caching disabled (queries direct to DB)`,
    );
    // Tear the client down. Without this the failed client keeps reconnecting
    // in the background and every cache helper below still holds a live
    // reference to a dead socket — the caller's `null` was cosmetic.
    try {
      await client.destroy?.();
    } catch {
      /* already closed */
    }
    redisClient = null;
    return null;
  }

  redisClient = client;
  return redisClient;
}

export function getRedis() {
  return redisClient;
}

// A client that connected once and later lost Redis stays assigned to
// `redisClient`, but once the reconnect strategy gives up it is terminal:
// `isReady` goes false and commands either reject or queue forever. Gate every
// helper on it so a dead client behaves exactly like no client at all.
const isUsable = () => Boolean(redisClient?.isReady);

export async function cacheGet(key) {
  if (!isUsable()) return null;
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.warn(`[cache] GET failed for ${key}: ${err.message}`);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!isUsable()) return;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.warn(`[cache] SET failed for ${key}: ${err.message}`);
  }
}

export async function cacheDel(key) {
  if (!isUsable()) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.warn(`[cache] DEL failed for ${key}: ${err.message}`);
  }
}

export async function cacheClear(pattern) {
  if (!isUsable()) return;
  try {
    // SCAN, never KEYS. KEYS is O(N) over the whole keyspace and blocks Redis
    // (single-threaded) for its entire duration, stalling every concurrent
    // reader. SCAN walks the keyspace in cursor batches so commands interleave.
    let cursor = '0';
    do {
      const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = String(reply.cursor);
      if (reply.keys.length > 0) {
        await redisClient.del(reply.keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn(`[cache] CLEAR failed for ${pattern}: ${err.message}`);
  }
}

export async function closeRedis() {
  if (!redisClient) return;
  const client = redisClient;
  // Clear first so an in-flight request can't pick the client back up mid-close.
  redisClient = null;
  try {
    // quit() drains pending commands but rejects if the socket is already gone;
    // destroy() is the unconditional teardown. Shutdown must not throw either way.
    if (client.isReady) await client.quit();
    else await client.destroy?.();
  } catch {
    /* already closed */
  }
  console.log('Redis connection closed');
}

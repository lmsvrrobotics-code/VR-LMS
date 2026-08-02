// src/middlewares/rateLimiter.js
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';

// Rate limit counters live in Redis so they are shared across every Bastion
// instance and survive restarts. With the previous in-memory store each
// replica counted separately (N replicas = N x the intended limit) and a
// deploy reset every counter to zero, which made the limit trivially bypassable
// and effectively decorative in any multi-instance deployment.
//
// Redis is a soft dependency: if it is unreachable we fall back to the
// in-memory store rather than refusing traffic. A gateway that fails closed on
// a cache outage turns a degraded dependency into a total outage.
let store;

// Flipped to false as soon as Redis proves unreachable. The RedisStore stays
// installed on the limiter, so this flag is what actually diverts traffic to
// the in-memory path — see the sendCommand guard below.
let redisUsable = true;

// Throttling state for the store-error logger installed on the limiter below.
let lastStoreErrorLog = 0;
let storeErrorCount = 0;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

try {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      // Don't let a hung connect attempt stall gateway startup.
      connectTimeout: 3000,
    },
  });

  // MUST be attached before connect(): an 'error' event with no listener is
  // an unhandled 'error' on an EventEmitter, which crashes the process. That
  // would mean a Redis blip takes down the entire gateway.
  //
  // Log at most once a minute. node-redis re-emits 'error' on every reconnect
  // attempt, so an unthrottled handler writes thousands of identical lines per
  // minute while Redis is down — that buries the signal and, with a json-file
  // driver and a disk quota, is its own outage. One line per minute is enough
  // to see the condition and how long it lasted.
  let lastRedisErrorLog = 0;
  client.on('error', (err) => {
    // Mark Redis unusable so sendCommand stops handing work to a socket that
    // isn't there. Without this the "fallback" below is only a log line: the
    // RedisStore keeps calling sendCommand, node-redis queues each command
    // against the dead socket, and every rate-limited request hangs until the
    // client gives up — which is indistinguishable from a hung gateway.
    redisUsable = false;
    const now = Date.now();
    if (now - lastRedisErrorLog > 60_000) {
      lastRedisErrorLog = now;
      console.error(
        `[Bastion] Redis (rate limiter) unavailable: ${err.message || err.code || 'connection error'} — ` +
          'falling back to per-instance limits until it recovers (further errors suppressed for 60s).',
      );
    }
  });

  // Recovered: node-redis emits 'ready' after a successful (re)connect, so the
  // shared counters resume automatically once Redis comes back.
  client.on('ready', () => {
    if (!redisUsable) console.info('[Bastion] Redis recovered — resuming shared rate-limit counters.');
    redisUsable = true;
  });

  // connect() is async; awaiting it at module scope would block startup on a
  // dead Redis. Fire it and let the store buffer — node-redis queues commands
  // issued before the socket is ready.
  client.connect().catch((err) => {
    console.warn(
      `[Bastion] Redis unavailable (${err.message}) — rate limiting falls back to per-instance memory.`,
    );
  });

  const redisStore = new RedisStore({
    prefix: 'bastion-rl:',
    // Reject rather than queue when the socket is down. express-rate-limit
    // treats a store rejection as "cannot count this request" and lets it
    // through, which is the intended soft-dependency behaviour. Returning a
    // pending promise instead would stall the request forever.
    sendCommand: (...args) => {
      if (!redisUsable || !client.isReady) {
        return Promise.reject(new Error('redis-unavailable'));
      }
      return client.sendCommand(args);
    },
  });

  // RedisStore's constructor kicks off SCRIPT LOAD and stores the promise
  // without a catch of its own. When Redis is down that promise rejects with
  // no handler attached — an unhandled rejection that takes the process down
  // on Node >=15. Observe both here; the store retries the load on the next
  // increment, so swallowing them costs nothing once Redis is back.
  for (const p of [redisStore.incrementScriptSha, redisStore.getScriptSha]) {
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  // Delegate to an in-memory store whenever Redis is unreachable, so a Redis
  // outage degrades to per-instance limits instead of no limits at all. Going
  // through passOnStoreError alone would let every request past uncounted,
  // which is a fail-open gateway — fine as a last resort, but a cache outage
  // shouldn't also remove the only brake on abusive traffic.
  const memoryFallback = new MemoryStore();
  store = {
    init: (options) => {
      memoryFallback.init?.(options);
      redisStore.init?.(options);
    },
    increment: (key) =>
      redisUsable && client.isReady ? redisStore.increment(key) : memoryFallback.increment(key),
    decrement: (key) =>
      redisUsable && client.isReady ? redisStore.decrement(key) : memoryFallback.decrement(key),
    resetKey: (key) =>
      redisUsable && client.isReady ? redisStore.resetKey(key) : memoryFallback.resetKey(key),
  };
} catch (err) {
  console.warn(
    `[Bastion] Could not initialise Redis rate-limit store (${err.message}) — using in-memory store.`,
  );
  store = undefined; // express-rate-limit falls back to MemoryStore
}

const limiter = rateLimit({
  ...(store ? { store } : {}),
  // A store failure must not become a gateway failure. Without this,
  // express-rate-limit rethrows the store error and every request 500s the
  // moment Redis blips — the same fail-closed behaviour the store comments
  // above are explicitly trying to avoid.
  passOnStoreError: true,
  // passOnStoreError logs a full stack trace per request by default; while
  // Redis is down that is one trace for every request through the gateway.
  // The client 'error' handler above already reports the condition once a
  // minute, so drop these to a counted line and keep the rest of the logger.
  logger: {
    ...console,
    error: () => {
      storeErrorCount += 1;
      const now = Date.now();
      if (now - lastStoreErrorLog > 60_000) {
        lastStoreErrorLog = now;
        console.warn(
          `[Bastion] rate-limit store unavailable — ${storeErrorCount} request(s) allowed ` +
            'without shared rate limiting in the last minute (suppressed for 60s).',
        );
        storeErrorCount = 0;
      }
    },
  },
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number(process.env.BASTION_RATE_LIMIT_MAX) || 2000, // per IP
  // Return rate-limit state in the standard RateLimit-* headers so clients can
  // back off before being blocked, instead of discovering the limit by hitting it.
  standardHeaders: true,
  legacyHeaders: false,
  // Health/readiness probes must never be rate limited — an uptime checker
  // sharing an IP with real traffic could otherwise cause a false "service
  // down" page and trigger a needless restart.
  skip: (req) => req.path === '/health' || req.path.startsWith('/api/_services'),
  message: { error: 'Too many requests, please try again later.' },
});

export default limiter;

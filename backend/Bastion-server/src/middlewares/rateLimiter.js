// src/middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit';
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
    const now = Date.now();
    if (now - lastRedisErrorLog > 60_000) {
      lastRedisErrorLog = now;
      console.error(
        `[Bastion] Redis (rate limiter) unavailable: ${err.message || err.code || 'connection error'} — ` +
          'falling back to per-instance limits until it recovers (further errors suppressed for 60s).',
      );
    }
  });

  // connect() is async; awaiting it at module scope would block startup on a
  // dead Redis. Fire it and let the store buffer — node-redis queues commands
  // issued before the socket is ready.
  client.connect().catch((err) => {
    console.warn(
      `[Bastion] Redis unavailable (${err.message}) — rate limiting falls back to per-instance memory.`,
    );
  });

  store = new RedisStore({
    prefix: 'bastion-rl:',
    sendCommand: (...args) => client.sendCommand(args),
  });
} catch (err) {
  console.warn(
    `[Bastion] Could not initialise Redis rate-limit store (${err.message}) — using in-memory store.`,
  );
  store = undefined; // express-rate-limit falls back to MemoryStore
}

const limiter = rateLimit({
  ...(store ? { store } : {}),
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

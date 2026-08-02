import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  initRedis,
  getRedis,
  closeRedis,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheClear,
} from '../src/cache/redis.js';

/**
 * Regression tests for the Redis cache client.
 *
 * The bug these pin down: initRedis() caught the connect() rejection and
 * returned null, but never destroyed the client. node-redis kept retrying
 * forever (the reconnect strategy never returned an Error), re-emitting 'error'
 * on every attempt, and the unthrottled handler logged the whole AggregateError
 * — ~25 lines of stack trace, twice a second, for the life of the process.
 */

/** Minimal stand-in for a node-redis v4 client. */
class FakeClient extends EventEmitter {
  constructor({ connectFails = false } = {}) {
    super();
    this.connectFails = connectFails;
    this.isReady = false;
    this.destroyed = false;
    this.quitCalled = false;
    this.commands = [];
    this.store = new Map();
    this.scanCalls = [];
  }

  async connect() {
    if (this.connectFails) {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:6379');
      err.code = 'ECONNREFUSED';
      // Real node-redis emits 'error' as well as rejecting.
      this.emit('error', err);
      throw err;
    }
    this.isReady = true;
    this.emit('ready');
  }

  async destroy() {
    this.destroyed = true;
    this.isReady = false;
  }

  async quit() {
    this.quitCalled = true;
    this.isReady = false;
  }

  async get(key) {
    this.commands.push(['get', key]);
    return this.store.get(key) ?? null;
  }

  async setEx(key, ttl, val) {
    this.commands.push(['setEx', key, ttl]);
    this.store.set(key, val);
  }

  async del(key) {
    this.commands.push(['del', key]);
  }

  async scan(cursor, opts) {
    this.scanCalls.push([cursor, opts]);
    // One page, then terminate.
    return cursor === '0'
      ? { cursor: 0, keys: ['route:GET:/a', 'route:GET:/b'] }
      : { cursor: 0, keys: [] };
  }

  async keys() {
    throw new Error('KEYS must never be called — it blocks Redis; use SCAN');
  }
}

/** Build a factory usable as the `createClient` dependency override. */
const factoryFor = (client) => {
  const fn = (opts) => {
    fn.opts = opts;
    return client;
  };
  return fn;
};

// initRedis caches its client in module state, so every test must reset it.
test.afterEach(async () => {
  await closeRedis();
});

test('initRedis returns null and destroys the client when Redis is unreachable', async () => {
  const client = new FakeClient({ connectFails: true });

  const result = await initRedis({ createClient: factoryFor(client) });

  assert.equal(result, null, 'caller must see null so caching is treated as off');
  assert.equal(
    client.destroyed,
    true,
    'failed client must be destroyed, else it reconnects forever and floods the log',
  );
  assert.equal(getRedis(), null, 'module state must not retain the dead client');
});

test('reconnectStrategy gives up instead of retrying forever', async () => {
  const client = new FakeClient({ connectFails: true });
  const factory = factoryFor(client);

  await initRedis({ createClient: factory });

  const { reconnectStrategy } = factory.opts.socket;

  // Early attempts back off and keep trying.
  assert.equal(reconnectStrategy(0), 0);
  assert.equal(reconnectStrategy(3), 150);
  // Backoff is capped so it never grows unbounded.
  assert.equal(reconnectStrategy(9), 450);
  // At the ceiling it returns an Error, which is how node-redis is told to stop.
  assert.ok(
    reconnectStrategy(10) instanceof Error,
    'strategy must return an Error to terminate the retry loop',
  );
  assert.ok(reconnectStrategy(50) instanceof Error);
});

test('connect failure is logged once as a message, not a full error object', async () => {
  const client = new FakeClient({ connectFails: true });
  const lines = [];
  const originalWarn = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));

  try {
    await initRedis({ createClient: factoryFor(client) });
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(lines.length > 0, 'the outage must still be reported');
  const joined = lines.join('\n');
  assert.ok(joined.includes('Redis unavailable'), 'should name the condition');
  // The old code logged the AggregateError object, dragging in stack frames.
  assert.ok(
    !joined.includes('at internalConnectMultiple'),
    'must not dump stack traces into the log',
  );
});

test('repeated error events are throttled to one line', async () => {
  const client = new FakeClient({ connectFails: true });
  const lines = [];
  const originalWarn = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));

  try {
    await initRedis({ createClient: factoryFor(client) });
    const before = lines.length;

    // Simulate the reconnect storm from the production log.
    const err = new Error('connect ECONNREFUSED 127.0.0.1:6379');
    for (let i = 0; i < 200; i += 1) client.emit('error', err);

    assert.equal(
      lines.length,
      before,
      '200 reconnect errors in one minute must not produce 200 log lines',
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('cache helpers no-op when Redis never connected', async () => {
  const client = new FakeClient({ connectFails: true });
  await initRedis({ createClient: factoryFor(client) });

  assert.equal(await cacheGet('k'), null);
  await cacheSet('k', { a: 1 });
  await cacheDel('k');
  await cacheClear('route:*');

  assert.deepEqual(client.commands, [], 'no command may be issued to a dead client');
});

test('cache helpers no-op when a connected client later goes down', async () => {
  const client = new FakeClient();
  await initRedis({ createClient: factoryFor(client) });

  await cacheSet('warm', { ok: true });
  assert.equal(client.commands.length, 1, 'sanity: works while ready');

  // Reconnect strategy exhausted: client is terminal but still assigned.
  client.isReady = false;

  assert.equal(await cacheGet('warm'), null);
  await cacheSet('warm', { ok: false });
  await cacheDel('warm');

  assert.equal(
    client.commands.length,
    1,
    'commands must stop once the client is no longer ready',
  );
});

test('cache round-trips values while Redis is up', async () => {
  const client = new FakeClient();
  await initRedis({ createClient: factoryFor(client) });

  await cacheSet('user:1', { id: 1, role: 'student' }, 120);
  assert.deepEqual(await cacheGet('user:1'), { id: 1, role: 'student' });

  const [, , ttl] = client.commands.find(([cmd]) => cmd === 'setEx');
  assert.equal(ttl, 120, 'TTL must be passed through');
});

test('cacheGet swallows malformed JSON rather than throwing', async () => {
  const client = new FakeClient();
  await initRedis({ createClient: factoryFor(client) });
  client.store.set('bad', '{not json');

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await cacheGet('bad'), null, 'a poisoned key must not break the request');
  } finally {
    console.warn = originalWarn;
  }
});

test('cacheClear uses SCAN, never KEYS', async () => {
  const client = new FakeClient();
  await initRedis({ createClient: factoryFor(client) });

  // FakeClient.keys() throws, so this also proves KEYS is not reached.
  await cacheClear('route:*');

  assert.equal(client.scanCalls.length, 1);
  const [cursor, opts] = client.scanCalls[0];
  assert.equal(cursor, '0');
  assert.equal(opts.MATCH, 'route:*');
  assert.ok(client.commands.some(([cmd]) => cmd === 'del'), 'matched keys must be deleted');
});

test('initRedis is idempotent and reuses the existing client', async () => {
  const first = new FakeClient();
  const second = new FakeClient();

  const a = await initRedis({ createClient: factoryFor(first) });
  const b = await initRedis({ createClient: factoryFor(second) });

  assert.equal(a, b, 'second call must reuse the connected client');
  assert.equal(second.isReady, false, 'a second client must never be created');
});

test('closeRedis quits a ready client and clears module state', async () => {
  const client = new FakeClient();
  await initRedis({ createClient: factoryFor(client) });

  await closeRedis();

  assert.equal(client.quitCalled, true);
  assert.equal(getRedis(), null);
});

test('closeRedis does not throw when the client is already gone', async () => {
  const client = new FakeClient();
  await initRedis({ createClient: factoryFor(client) });

  // Socket dropped: quit() would reject, so destroy() is the correct path.
  client.isReady = false;
  client.quit = async () => {
    throw new Error('The client is closed');
  };

  await closeRedis();
  assert.equal(client.destroyed, true);
  assert.equal(getRedis(), null);
});

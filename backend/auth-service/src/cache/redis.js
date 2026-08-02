import Redis from 'redis';

let redisClient = null;

export async function initRedis() {
  if (redisClient) return redisClient;

  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = Redis.createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500),
    },
    legacyMode: false,
  });

  redisClient.on('error', (err) => {
    console.error('❌ Redis error:', err);
    // Don't crash on Redis error — fall back to direct DB queries
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('⚠️  Redis unavailable, caching disabled (queries direct to DB)');
    return null;
  }

  return redisClient;
}

export function getRedis() {
  return redisClient;
}

export async function cacheGet(key) {
  if (!redisClient) return null;
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.error('Redis GET error:', err);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!redisClient) return;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error('Redis SET error:', err);
  }
}

export async function cacheDel(key) {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error('Redis DEL error:', err);
  }
}

export async function cacheClear(pattern) {
  if (!redisClient) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (err) {
    console.error('Redis CLEAR error:', err);
  }
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
}

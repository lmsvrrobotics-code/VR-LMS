const redis = require('redis');
const logger = require('./logger');

let redisClient = null;

async function initRedis() {
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      },
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (err) {
    logger.error('Failed to initialize Redis', { error: err.message });
    // Fallback: return null to allow app to run without Redis
    return null;
  }
}

// Cache functions
async function getCachedUser(userId) {
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get(`user:${userId}`);
    if (cached) {
      logger.debug('Cache hit', { userId });
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.error('Redis get error', { userId, error: err.message });
  }
  return null;
}

async function setCachedUser(userId, userData, ttl = 300) {
  if (!redisClient) return;

  try {
    await redisClient.setEx(
      `user:${userId}`,
      ttl,
      JSON.stringify(userData)
    );
    logger.debug('Cache set', { userId, ttl });
  } catch (err) {
    logger.error('Redis set error', { userId, error: err.message });
  }
}

async function deleteCachedUser(userId) {
  if (!redisClient) return;

  try {
    await redisClient.del(`user:${userId}`);
    logger.debug('Cache deleted', { userId });
  } catch (err) {
    logger.error('Redis delete error', { userId, error: err.message });
  }
}

// Token blacklist
async function blacklistToken(token, expiresIn) {
  if (!redisClient) return;

  try {
    await redisClient.setEx(`blacklist:${token}`, expiresIn, '1');
    logger.debug('Token blacklisted', { expiresIn });
  } catch (err) {
    logger.error('Failed to blacklist token', { error: err.message });
  }
}

async function isTokenBlacklisted(token) {
  if (!redisClient) return false;

  try {
    const result = await redisClient.get(`blacklist:${token}`);
    return result !== null;
  } catch (err) {
    logger.error('Failed to check token blacklist', { error: err.message });
    return false;
  }
}

// Session tracking
async function setUserSession(userId, sessionData, ttl = 86400) {
  if (!redisClient) return;

  try {
    await redisClient.setEx(
      `session:${userId}`,
      ttl,
      JSON.stringify(sessionData)
    );
  } catch (err) {
    logger.error('Failed to set session', { userId, error: err.message });
  }
}

async function getUserSession(userId) {
  if (!redisClient) return null;

  try {
    const session = await redisClient.get(`session:${userId}`);
    return session ? JSON.parse(session) : null;
  } catch (err) {
    logger.error('Failed to get session', { userId, error: err.message });
    return null;
  }
}

// Monitor pool health
function startPoolMonitoring() {
  if (!redisClient) return;

  setInterval(async () => {
    try {
      const info = await redisClient.info('stats');
      logger.info('Redis pool health', {
        connected: redisClient.connected,
        info: info.substring(0, 200),
      });
    } catch (err) {
      logger.error('Failed to get Redis info', { error: err.message });
    }
  }, 60000); // Every minute
}

module.exports = {
  initRedis,
  getCachedUser,
  setCachedUser,
  deleteCachedUser,
  blacklistToken,
  isTokenBlacklisted,
  setUserSession,
  getUserSession,
  startPoolMonitoring,
};

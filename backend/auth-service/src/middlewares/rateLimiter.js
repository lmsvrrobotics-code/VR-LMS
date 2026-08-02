const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../lib/logger');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

// Store for rate limiting
const store = new RedisStore({
  client: redisClient,
  prefix: 'rate-limit:',
});

// ✅ Login: 5 attempts per minute per IP
const loginLimiter = rateLimit({
  store,
  windowMs: 60 * 1000,
  max: 5,
  message: {
    error: 'Too many login attempts. Please try again in 1 minute.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    logger.warn('Login rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
    });
    res.status(429).json({
      error: 'Too many login attempts. Please try again in 1 minute.',
      retryAfter: 60,
    });
  },
});

// ✅ Register: 3 per 10 minutes per IP
const registerLimiter = rateLimit({
  store,
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: {
    error: 'Too many registration attempts. Please try again later.',
    retryAfter: 600,
  },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    logger.warn('Register rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many registration attempts. Please try again later.',
      retryAfter: 600,
    });
  },
});

// ✅ Refresh: 10 per minute per user ID
const refreshLimiter = rateLimit({
  store,
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: 'Token refresh limit exceeded. Please try again later.',
    retryAfter: 60,
  },
  keyGenerator: (req) => {
    // Use user ID from JWT if available, otherwise use IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Refresh token rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
    });
    res.status(429).json({
      error: 'Token refresh limit exceeded. Please try again later.',
      retryAfter: 60,
    });
  },
});

// ✅ General API: 100 requests per minute per user
const apiLimiter = rateLimit({
  store,
  windowMs: 60 * 1000,
  max: 100,
  message: {
    error: 'Too many API requests. Please slow down.',
    retryAfter: 60,
  },
  keyGenerator: (req) => {
    // Only rate limit authenticated users
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === '/health';
  },
  handler: (req, res) => {
    logger.warn('API rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too many API requests. Please slow down.',
      retryAfter: 60,
    });
  },
});

// ✅ Password reset: 3 per 24 hours per email
const passwordResetLimiter = rateLimit({
  store,
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  message: {
    error: 'Too many password reset attempts. Please try again tomorrow.',
    retryAfter: 86400,
  },
  keyGenerator: (req) => req.body?.email || req.ip,
  handler: (req, res) => {
    logger.warn('Password reset rate limit exceeded', {
      email: req.body?.email,
      ip: req.ip,
    });
    res.status(429).json({
      error: 'Too many password reset attempts. Please try again tomorrow.',
      retryAfter: 86400,
    });
  },
});

module.exports = {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  apiLimiter,
  passwordResetLimiter,
};

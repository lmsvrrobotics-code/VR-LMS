const csrf = require('csurf');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('redis');

// For CSRF tokens, use a dedicated Redis client (separate from cache)
// If Redis unavailable, fall back to memory storage (acceptable for dev)
let csrfStore = undefined;
let csrfClient = null;

const env = require('../config/env');
if (env.redis?.url) {
    try {
        csrfClient = redis.createClient({ url: env.redis.url });
        csrfClient.connect().catch(e => {
            console.warn('[CSRF] Redis connection failed, using memory store:', e.message);
            csrfClient = null;
        });
        csrfStore = new RedisStore({ client: csrfClient });
    } catch (e) {
        console.warn('[CSRF] Redis init failed, using memory store:', e.message);
    }
}

// Session middleware (MUST run before CSRF middleware)
const sessionMiddleware = session({
    store: csrfStore,
    secret: env.jwt?.secret || 'default-session-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: env.env === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
});

// CSRF protection with double-submit cookie fallback
const csrfProtection = csrf({
    cookie: {
        secure: env.env === 'production',
        httpOnly: true,
        sameSite: 'strict',
    },
});

// Generate CSRF token for GET requests (login forms, etc)
const generateToken = (req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
};

module.exports = {
    sessionMiddleware,
    csrfProtection,
    generateToken,
};

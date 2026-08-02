import { cacheGet, cacheSet } from './redis.js';

/**
 * Route-level response cache.
 *
 * SECURITY — read this before changing anything here.
 *
 * This cache is SHARED across all users and its key is derived from the URL
 * only. That makes it safe ONLY for responses that are identical for every
 * caller. Caching a per-user response here leaks one user's data to another.
 *
 * That was not hypothetical. This middleware used to run on every GET with a
 * deny-list (`req.path.includes('/auth/')`). But the auth routes are mounted at
 * the ROOT (`app.use('/', authRoutes)`), so the live path of the profile
 * endpoint is `/profile` — which does NOT contain '/auth/'. The deny-list never
 * matched, so `GET /profile` was cached under `route:GET:/profile`, a key with
 * no user identity in it. The first caller populated it and every other user for
 * the next 5 minutes received THAT user's profile, including their role and
 * email. A teacher logging in received a student's profile and was routed to the
 * student dashboard; a student could equally receive a teacher's identity.
 *
 * This middleware is now ALLOW-LIST based AND refuses to cache anything that
 * looks user-specific. Both checks are deliberate: a newly added endpoint is
 * UNCACHED until someone explicitly opts it in, so the unsafe default cannot
 * silently come back.
 */

/**
 * Exact paths safe to cache in a shared, user-agnostic cache.
 * Only add a route here when its response is IDENTICAL for every caller and
 * contains no user-specific data. When in doubt, do not add it.
 *
 * Currently EMPTY, deliberately. Every route this service exposes is either
 * authenticated (all of /roles/* sits behind isLoggedIn, and /profile is
 * per-user) or a mutation. There is nothing here that is both public and
 * cacheable, so a shared response cache has no safe work to do.
 *
 * The middleware is kept wired up so a genuinely public, user-agnostic GET can
 * opt in later by adding its exact path here — and so the `isUserScoped` guard
 * below keeps protecting that future route.
 */
const CACHEABLE_PATHS = new Set([]);

const isCacheablePath = (path, allowed = CACHEABLE_PATHS) => {
  // Normalise one trailing slash so '/x/' matches '/x'.
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return allowed.has(p);
};

/**
 * Does this request carry per-user identity? If so its response is
 * user-specific and must never enter a shared cache, regardless of the
 * allow-list. This guards against a path being added that turns out to vary
 * per user once auth is applied to it.
 */
const isUserScoped = (req) =>
  Boolean(
    req.headers?.authorization ||
    req.headers?.cookie ||
    req.cookies?.accessToken ||
    req.user
  );

/**
 * @param ttlSeconds cache lifetime
 * @param deps       overrides for testing: `cacheGet`/`cacheSet` swap the cache
 *                   backend so tests need no live Redis, and `cacheablePaths`
 *                   supplies a sample allow-list so the opt-in mechanism can be
 *                   verified without pinning the test to a real route.
 *                   Production callers pass nothing.
 */
export function cacheMiddleware(ttlSeconds = 300, deps = {}) {
  const allowed = deps.cacheablePaths ?? CACHEABLE_PATHS;
  const get = deps.cacheGet ?? cacheGet;
  const set = deps.cacheSet ?? cacheSet;

  return async (req, res, next) => {
    // Only cache GET requests.
    if (req.method !== 'GET') return next();

    // Allow-list: anything not explicitly opted in is never cached.
    if (!isCacheablePath(req.path, allowed)) return next();

    // Never share a response produced for a specific user.
    if (isUserScoped(req)) return next();

    const cacheKey = `route:${req.method}:${req.originalUrl}`;

    // A cache read must never be able to take auth down: on a Redis error fall
    // through and serve from the source of truth.
    let cached = null;
    try {
      cached = await get(cacheKey);
    } catch (err) {
      console.warn(`[cache] read failed for ${cacheKey}: ${err.message}`);
    }

    if (cached) {
      return res.status(cached.status).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Re-check at WRITE time: middleware ordering means req.user may only be
      // populated later by an auth middleware. If that happened, this response
      // is user-specific and must not be stored.
      const safeToStore =
        res.statusCode === 200 &&
        !isUserScoped(req) &&
        // A response carrying Set-Cookie (e.g. a session) is per-user.
        !res.getHeader('set-cookie');

      if (safeToStore) {
        Promise.resolve(set(cacheKey, { status: 200, body }, ttlSeconds)).catch(
          (err) => console.warn(`[cache] write failed for ${cacheKey}: ${err.message}`)
        );
      }
      return originalJson(body);
    };

    next();
  };
}

export function invalidateRouteCache(pattern) {
  return (req, res, next) => {
    res.on('finish', async () => {
      if ([200, 201, 204].includes(res.statusCode)) {
        try {
          const { cacheClear } = await import('./redis.js');
          await cacheClear(pattern);
        } catch (err) {
          console.warn(`[cache] invalidation failed for ${pattern}: ${err.message}`);
        }
      }
    });
    next();
  };
}

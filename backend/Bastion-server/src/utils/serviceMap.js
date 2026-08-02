// Only services on the production path are routed. The legacy
// course/organisation/college/payment services were removed — admin-service
// owns courses, payments and colleges now (see /api/public + /api/admin).
const serviceMap = {
  auth: {
    path: 'auth',
    url: process.env.AUTH_SERVICE_URL || '',
    host: process.env.AUTH_SERVICE_HOST || 'localhost',
    port: process.env.AUTH_SERVICE_PORT || 8001,
  },
  assessment: {
    path: 'assessment',
    url: process.env.ASSESSMENT_SERVICE_URL || '',
    host: process.env.ASSESSMENT_SERVICE_HOST || 'localhost',
    port: process.env.ASSESSMENT_SERVICE_PORT || 8003,
  },
  admin: {
    path: 'admin',
    url: process.env.ADMIN_SERVICE_URL || '',
    host: process.env.ADMIN_SERVICE_HOST || 'localhost',
    // admin-service listens on 5000 (see its server.js / .env). The old 8007
    // default pointed at nothing; it stayed hidden because every environment
    // happens to set ADMIN_SERVICE_URL, so the fallback was never exercised.
    port: process.env.ADMIN_SERVICE_PORT || 5000,
    stripPrefix: '/api/v1/admin',
    // admin-service mounts its admin routes at `/api/admin/*` (e.g. the login is
    // `/api/admin/auth/login`). With forwardPrefix '/api' the gateway forwarded
    // to `/api/auth/login`, which 404s. The frontend currently calls admin-service
    // directly so this was latent, but the mapping must match the real mount.
    forwardPrefix: '/api/admin',
  },

};

// Resolve a service's base target. Prefer a full URL (e.g. a Railway public
// HTTPS domain set via <SVC>_SERVICE_URL) so production needs no host/port or
// http→https juggling; fall back to http://host:port for local/compose dev.
export function targetFor(service) {
  if (service.url) return service.url.replace(/\/+$/, '');
  return `http://${service.host}:${service.port}`;
}

export default serviceMap;

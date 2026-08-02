import { Router } from 'express';
import httpProxy from 'express-http-proxy';
import serviceMap, { targetFor } from '../utils/serviceMap.js';
import HealthMonitor from '../utils/healthMonitor.js';
import { isAllowedOrigin } from '../utils/cors.js';

const router = Router();
const healthMonitor = new HealthMonitor(serviceMap);

// Probe every 30s by default. The previous 2hr interval meant the health map
// could be ~2hrs stale, so /api/_services/health reported a long-dead service
// as healthy — useless for on-call triage and for the gating check below.
// Override with BASTION_HEALTH_INTERVAL_MS if the probe traffic ever matters.
const HEALTH_INTERVAL_MS = Number(process.env.BASTION_HEALTH_INTERVAL_MS) || 30_000;
healthMonitor.startMonitoring(HEALTH_INTERVAL_MS);

// Run health check once on startup
(async () => {
  const results = await healthMonitor.checkAll();
  console.log('=== Service Health on Startup ===');
  for (const [name, status] of Object.entries(results)) {
    console.log(`${name}: ${status.healthy ? '✅ healthy' : '❌ unhealthy'}`);
  }
  console.log('=================================');
})();

Object.entries(serviceMap).forEach(([name, service]) => {
  // Full URL via <SVC>_SERVICE_URL (prod) or http://host:port (local dev).
  const target = targetFor(service);
  const proxy = httpProxy(target, {
    // preserveHostHdr MUST stay false on Railway: the platform edge routes by the
    // HTTP Host header, so forwarding Bastion's own host makes every proxied
    // request loop back to Bastion ("Welcome to Bastion Server"). Letting
    // express-http-proxy send the upstream's host routes to the real service.
    preserveHostHdr: false,
    // Default proxy body limit is 1mb — too small for legitimate file uploads
    // (e.g. college ID proofs in pre-assessment registration). Match the
    // upstream's own multer cap so the proxy isn't the bottleneck.
    limit: '20mb',
    proxyReqPathResolver: (req) => {
      const stripped = req.originalUrl.replace(`/api/v1/${service.path}`, '') || '/';
      return service.forwardPrefix ? `${service.forwardPrefix}${stripped === '/' ? '' : stripped}` : stripped;
    },
    // express-http-proxy pipes the upstream response straight back to the
    // client, so any CORS header Bastion's own cors() middleware would have
    // set is overwritten by upstream's. Several upstream services ship a
    // broken combo (`Access-Control-Allow-Origin: *` + credentials), which
    // browsers reject. Here we strip every upstream Access-Control-* and
    // re-emit the correct ones based on the request's Origin.
    userResHeaderDecorator: (headers, userReq) => {
      Object.keys(headers).forEach((h) => {
        if (h.toLowerCase().startsWith('access-control-')) delete headers[h];
      });
      const origin = userReq.headers?.origin;
      if (origin && isAllowedOrigin(origin)) {
        headers['access-control-allow-origin'] = origin;
        headers['access-control-allow-credentials'] = 'true';
        headers['vary'] = headers['vary'] ? `${headers['vary']}, Origin` : 'Origin';
      }
      return headers;
    },
    // Transport-level failure only (upstream crashed, connection reset,
    // timeout). An upstream that *answered* — including 4xx/5xx — never
    // reaches here; express-http-proxy streams that response through
    // untouched, preserving its real status code and body.
    //
    // Only genuine connection errors mean the service is actually down, so
    // only those trigger a re-probe. Re-probing on an upstream 429/401 would
    // be pointless load against a service that is plainly alive.
    //
    // Map the socket error to the status that describes it: a timeout is 504,
    // anything else unreachable is 502. Returning a blanket 502 for every
    // failure mode hides *why* a request failed, which turns a one-minute
    // diagnosis into an hour of guessing.
    proxyErrorHandler: (err, res, next) => {
      healthMonitor.checkOne(name).catch(() => {});
      if (res.headersSent) return next(err);

      const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      return res.status(timedOut ? 504 : 502).json({
        error: `${service.path} did not respond`,
        code: err.code || 'UPSTREAM_ERROR',
        details: err.message || 'Upstream connection failed',
        retryHint: 'The service is being re-probed; retry after a few seconds.',
      });
    },
  });

  router.use(`/v1/${service.path}`, (req, res, next) => {
    const status = healthMonitor.getStatus(name);

    // No status yet = the startup probe hasn't finished. Forward optimistically
    // instead of 503ing the boot race — if the upstream really is down the
    // proxyErrorHandler above returns a clean 502 and marks it for re-probe.
    //
    // Only refuse traffic when the probe failed because the service was
    // genuinely unreachable. A probe that got an HTTP *response* (e.g. a 429
    // from the upstream's own rate limiter, or a 5xx on one endpoint) proves
    // the process is alive and accepting connections, so blocking every user
    // on that signal converts a partial degradation into a total outage — the
    // gateway becomes the thing causing the downtime. Forward instead and let
    // the real response (or a transport error) decide.
    const unreachable =
      status && !status.healthy && !/status code/i.test(status.error || '');

    if (unreachable) {
      console.warn(`[Bastion] ${service.path} is DOWN (last checked: ${status?.lastChecked ?? 'never'})`);
      return res.status(503).json({
        error: `${service.path} unavailable`,
        lastChecked: status?.lastChecked ?? null,
        details: status?.error || 'No response from service',
        // Bastion will re-probe automatically on the next request — let the
        // client know retrying after a short delay should work once the
        // upstream service is back up.
        retryHint: 'Bastion auto-probes downed services on each request; retry after a few seconds.',
      });
    }

    console.log(`[Bastion] Forwarding ${req.method} ${req.originalUrl} → ${target}`);
    proxy(req, res, next);
  });
});

// expose Bastion’s view of service health
router.get('/_services/health', (req, res) => {
  res.json(healthMonitor.statusMap);
});

// force a fresh health check across all services
router.post('/_services/health/refresh', async (_req, res) => {
  const results = await healthMonitor.checkAll();
  res.json(results);
});

export default router;

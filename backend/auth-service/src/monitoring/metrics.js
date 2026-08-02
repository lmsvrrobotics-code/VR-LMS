import * as prometheus from 'prom-client';

// Initialize Prometheus client
const register = new prometheus.Registry();

// Default metrics (CPU, memory, etc.)
prometheus.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const dbConnectionPoolSize = new prometheus.Gauge({
  name: 'db_connection_pool_size',
  help: 'Current database connection pool size',
  registers: [register],
});

export const dbConnectionsActive = new prometheus.Gauge({
  name: 'db_connections_active',
  help: 'Active database connections',
  registers: [register],
});

export const cacheHits = new prometheus.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMisses = new prometheus.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const authFailures = new prometheus.Counter({
  name: 'auth_failures_total',
  help: 'Total authentication failures',
  labelNames: ['reason'],
  registers: [register],
});

export const bruteForceAttempts = new prometheus.Counter({
  name: 'brute_force_attempts_total',
  help: 'Total brute force attempts',
  labelNames: ['email'],
  registers: [register],
});

export function getRegister() {
  return register;
}

// Middleware to track HTTP request metrics
export function metricsMiddleware() {
  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const method = req.method;
      const status = res.statusCode;

      httpRequestDuration.observe(
        { method, route, status_code: status },
        duration
      );

      httpRequestTotal.inc({
        method,
        route,
        status_code: status,
      });
    });

    next();
  };
}

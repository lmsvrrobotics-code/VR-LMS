const Sentry = require('@sentry/node');
const logger = require('./logger');

// ✅ Initialize Sentry for error tracking
function initSentry(app) {
  if (!process.env.SENTRY_DSN) {
    logger.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app, request: true, serverName: true }),
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    beforeSend(event, hint) {
      // Filter sensitive data
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /password=.*?(&|$)/gi,
          'password=***&'
        );
      }
      return event;
    },
  });

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());

  logger.info('✅ Sentry initialized');
  return Sentry;
}

// ✅ Error handler for Sentry
function errorHandler(err, req, res, next) {
  Sentry.captureException(err, {
    tags: {
      service: 'auth-service',
      endpoint: req.path,
      method: req.method,
    },
    contexts: {
      request: {
        url: req.url,
        method: req.method,
        headers: {
          'user-agent': req.headers['user-agent'],
        },
        userId: req.user?.id,
        ip: req.ip,
      },
    },
  });

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    userId: req.user?.id,
  });

  res.status(500).json({
    error: 'Internal server error',
    sentryId: Sentry.lastEventId(),
  });
}

// ✅ Monitor database connection pool
function monitorConnectionPool(sequelize) {
  setInterval(() => {
    try {
      const pool = sequelize.connectionManager.pool;

      const totalConnections = pool._allConnectionObjects?.length || 0;
      const availableConnections = pool._availableObjects?.length || 0;
      const waitingConnections = pool._waitingQueue?.length || 0;

      const utilization = totalConnections > 0
        ? ((totalConnections - availableConnections) / totalConnections) * 100
        : 0;

      logger.info('Database Pool Status', {
        totalConnections,
        availableConnections,
        waitingConnections,
        utilization: `${utilization.toFixed(1)}%`,
      });

      // Alert if utilization > 80%
      if (utilization > 80) {
        logger.error('⚠️ Connection Pool Critical', {
          utilization,
          totalConnections,
          availableConnections,
        });

        Sentry.captureMessage(
          `Connection pool utilization critical: ${utilization.toFixed(1)}%`,
          'error'
        );
      }

      // Alert if too many waiting connections
      if (waitingConnections > 5) {
        logger.error('⚠️ Connection Pool Bottleneck', {
          waitingConnections,
        });

        Sentry.captureMessage(
          `${waitingConnections} connections waiting for pool`,
          'warning'
        );
      }
    } catch (err) {
      logger.error('Failed to monitor connection pool', {
        error: err.message,
      });
    }
  }, 60000); // Every minute
}

// ✅ Monitor Redis connection
function monitorRedis(redisClient) {
  setInterval(() => {
    if (!redisClient) return;

    redisClient
      .ping()
      .then(() => {
        logger.debug('Redis health check: OK');
      })
      .catch((err) => {
        logger.error('Redis health check failed', {
          error: err.message,
        });

        Sentry.captureException(err, {
          tags: { component: 'redis' },
        });
      });
  }, 60000); // Every minute
}

// ✅ Track authentication metrics
function trackAuthMetric(event, metadata = {}) {
  const timestamp = new Date().toISOString();

  logger.info(`Auth Event: ${event}`, {
    timestamp,
    ...metadata,
  });

  // Send to Sentry as breadcrumb for later analysis
  Sentry.captureMessage(`${event}`, 'info');
}

module.exports = {
  initSentry,
  errorHandler,
  monitorConnectionPool,
  monitorRedis,
  trackAuthMetric,
};

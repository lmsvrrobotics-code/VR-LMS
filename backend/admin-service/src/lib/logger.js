/**
 * Structured logger with request correlation IDs
 * - Logs in JSON format for easy parsing in production
 * - Includes request ID, user ID, and context
 * - Integrated with Sentry for error tracking
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info('User logged in', { userId, email });
 *   logger.error('Payment failed', { error, orderId }, error);
 */

const Sentry = require('@sentry/node');

// Log levels
const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL || 'INFO'] ?? LEVELS.INFO;

/**
 * Format timestamp as ISO 8601
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Create structured log object
 */
function createLogEntry(level, message, context = {}, error = null) {
  const entry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...context,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return entry;
}

/**
 * Log to stdout (captured by container orchestration)
 */
function logToStdout(level, levelName, logEntry) {
  const output = JSON.stringify(logEntry);
  if (level >= LEVELS.ERROR) {
    console.error(output);
  } else {
    console.log(output);
  }
}

/**
 * Log function factory
 */
function createLogger(levelName, level) {
  return (message, context = {}, error = null) => {
    if (level < LOG_LEVEL) return; // Skip lower priority logs

    const logEntry = createLogEntry(levelName, message, context, error);
    logToStdout(level, levelName, logEntry);

    // Capture in Sentry for ERROR and above
    if (level >= LEVELS.ERROR && error) {
      Sentry.captureException(error, { contexts: { request: context } });
    } else if (level >= LEVELS.ERROR) {
      Sentry.captureMessage(message, 'error');
    } else if (level >= LEVELS.WARN) {
      Sentry.captureMessage(message, 'warning');
    }
  };
}

// Logger API
const logger = {
  debug: createLogger('DEBUG', LEVELS.DEBUG),
  info: createLogger('INFO', LEVELS.INFO),
  warn: createLogger('WARN', LEVELS.WARN),
  error: createLogger('ERROR', LEVELS.ERROR),
};

/**
 * Middleware to inject request correlation ID
 * Generates a unique ID for each request to trace across services
 * Usage: app.use(requestIdMiddleware);
 */
function requestIdMiddleware(req, res, next) {
  // Check for existing ID (from upstream proxy)
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;

  // Pass to downstream
  res.setHeader('X-Request-ID', requestId);

  // Log the request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  // Log response when it's sent
  const originalSend = res.send;
  res.send = function(data) {
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${Date.now() - req._startTime}ms`,
    });
    return originalSend.call(this, data);
  };

  req._startTime = Date.now();
  next();
}

/**
 * Generate a unique request ID (uuid-like)
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Middleware to inject user context into logger
 * Extracts from verified JWT and makes available to logger
 */
function userContextMiddleware(req, res, next) {
  if (req.authUser) {
    // Set Sentry user context
    Sentry.setUser({
      id: req.authUser.userId,
      email: req.authUser.email,
      role: req.authUser.role,
    });

    // Enhance context for all logs
    const originalInfo = logger.info;
    const originalError = logger.error;

    req.log = {
      info: (msg, ctx = {}) => originalInfo(msg, { ...ctx, userId: req.authUser.userId, requestId: req.requestId }),
      error: (msg, ctx = {}, err) => originalError(msg, { ...ctx, userId: req.authUser.userId, requestId: req.requestId }, err),
    };
  }

  next();
}

/**
 * Audit log for sensitive operations
 * Usage: auditLog('PAYMENT_CAPTURED', { orderId, amount }, req.authUser.userId);
 *
 * Also persists to the audit_log table in Supabase for compliance/forensics
 */
function auditLog(action, data = {}, userId = null, req = null) {
  const auditEntry = {
    action,
    userId,
    ...data,
    timestamp: new Date().toISOString(),
  };

  logger.info('AUDIT', auditEntry);

  // Persist to Supabase audit_log table asynchronously (fire-and-forget)
  // so it doesn't block the request
  (async () => {
    try {
      const { sequelize } = require('../models');
      await sequelize.query(`
        SELECT audit.log_event(
          :action,
          :actor_id,
          :actor_email,
          :actor_role,
          :resource_type,
          :resource_id,
          :changes,
          :request_id,
          :ip_address,
          'success',
          NULL,
          :metadata
        )
      `, {
        replacements: {
          action,
          actor_id: userId || null,
          actor_email: req?.user?.email || req?.authUser?.email || null,
          actor_role: req?.user?.role || req?.authUser?.role || null,
          resource_type: data.resource_type || null,
          resource_id: data.resource_id || null,
          changes: data.changes ? JSON.stringify(data.changes) : null,
          request_id: req?.requestId || null,
          ip_address: req?.ip || null,
          metadata: Object.keys(data).length > 0 ? JSON.stringify(data) : null,
        },
      });
    } catch (err) {
      // Never block requests on audit failures, just log to Sentry
      Sentry.captureException(err, {
        tags: { type: 'audit_log_failure' },
        extra: { action, userId },
      });
    }
  })();
}

module.exports = {
  logger,
  requestIdMiddleware,
  userContextMiddleware,
  generateRequestId,
  auditLog,
};

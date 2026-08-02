const { logger } = require('../lib/logger');

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const errorHandler = (err, req, res, _next) => {
    const status = err.status || 500;
    const requestId = req.requestId || req.id || 'unknown';

    // SECURITY: Never leak internal errors (SQL, stack traces) to client on 5xx
    const clientMessage = status >= 500
        ? 'Internal server error'
        : err.message || 'Server error';

    // Log with full context for debugging
    const context = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status,
        userId: req.user?.id || req.authUser?.userId || null,
        ip: req.ip,
    };

    if (status >= 500) {
        logger.error('Unhandled server error', context, err);
    } else if (status >= 400) {
        logger.warn(`[${status}] ${req.method} ${req.originalUrl} — ${err.message}`, context);
    }

    res.status(status).json({
        error: clientMessage,
        requestId, // Client can use this to look up full error in logs
    });
};

module.exports = { HttpError, asyncHandler, errorHandler };

const { logger } = require('../lib/logger');

class HttpError extends Error {
    /**
     * @param status  HTTP status
     * @param message message shown to the user verbatim on 4xx — write it for
     *                a person, not a log line
     * @param meta    optional { field } naming the form input at fault, so the
     *                client can focus and highlight it rather than showing a
     *                page-level banner the user has to map back to a box;
     *                { expose: true } marks a 5xx message as safe to show
     *                verbatim (e.g. "video service credentials are invalid") —
     *                by default 5xx messages are masked to avoid leaking internals
     */
    constructor(status, message, meta = {}) {
        super(message);
        this.status = status;
        if (meta && meta.field) this.field = meta.field;
        if (meta && meta.expose) this.expose = true;
    }
}

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const errorHandler = (err, req, res, _next) => {
    const status = err.status || 500;
    const requestId = req.requestId || req.id || 'unknown';

    // SECURITY: Never leak internal errors (SQL, stack traces) to client on 5xx
    // — UNLESS the error was raised with { expose: true }, meaning its message
    // was written for the user (e.g. an upstream service is misconfigured) and
    // carries nothing sensitive.
    const clientMessage = (status >= 500 && !err.expose)
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

    // `field` only rides along on 4xx: a 5xx message is replaced above, so
    // pointing at an input would be misleading.
    const payload = {
        error: clientMessage,
        requestId, // Client can use this to look up full error in logs
    };
    if (status < 500 && err.field) payload.field = err.field;
    res.status(status).json(payload);
};

module.exports = { HttpError, asyncHandler, errorHandler };

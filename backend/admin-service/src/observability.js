// Sentry wiring (CommonJS). Self-initializing on require — guarded by
// SENTRY_DSN so local dev / CI without a DSN is a complete no-op.
//
// For full Express auto-instrumentation, require this module first in the
// service entrypoint (src/server.js):  require('./observability');
// Error capture via setupExpressErrorHandler works regardless of order.
const Sentry = require('@sentry/node');

const dsn = process.env.SENTRY_DSN;
const enabled = Boolean(dsn);

if (enabled) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.SENTRY_RELEASE || undefined,
        serverName: process.env.SERVICE_NAME || 'admin-service',
        // Sample rate: 1.0 for production (100% of traces), 0.1 for dev (10%)
        // If you have high volume, use adaptive sampling or 0.5 (50%)
        tracesSampleRate: process.env.NODE_ENV === 'production'
            ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 1.0)
            : Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
        // Capture performance metrics for slow transactions.
        //
        // @sentry/node v8 removed the `Sentry.Integrations.*` namespace in
        // favour of factory functions. The old `new Sentry.Integrations.Http()`
        // form threw "Cannot read properties of undefined (reading 'Http')" at
        // require time — and because this whole block is gated on SENTRY_DSN,
        // it only crashed where a DSN is actually set. Local dev (no DSN) was a
        // silent no-op, so the fault first appeared in the container.
        integrations: [
            Sentry.httpIntegration(),
            Sentry.onUncaughtExceptionIntegration(),
            Sentry.onUnhandledRejectionIntegration(),
        ],
        // Breadcrumbs for debugging
        maxBreadcrumbs: 50,
        attachStacktrace: true,
    });
    console.log('[observability] Sentry initialised with traces enabled');
}

function attachErrorHandler(app) {
    if (enabled) Sentry.setupExpressErrorHandler(app);
}

module.exports = { Sentry, sentryEnabled: enabled, attachErrorHandler };

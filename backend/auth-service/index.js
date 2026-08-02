import app, { initDb } from './src/app.js';
import { initRedis } from './src/cache/redis.js';
import { runMigrationsViaPg } from './src/db/runMigrations.js';

// Last-resort guards: a stray async throw or rejected promise must NOT silently
// kill the auth process (that = login down). Log so Sentry/host capture it; the
// host (Railway) restarts on a real exit, but we keep serving where we can.
process.on('unhandledRejection', (reason) => {
  console.error('[auth-service] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[auth-service] Uncaught exception:', err);
});

const PORT = process.env.PORT || 8001;

async function startup() {
  try {
    console.log('🚀 Starting auth-service...');

    // 1. Init database
    console.log('📦 Initializing database...');
    await initDb();

    // 2. Run migrations (creates indexes)
    console.log('🔄 Running migrations...');
    await runMigrationsViaPg();

    // 3. Init Redis (optional, fails gracefully)
    console.log('📍 Initializing Redis cache...');
    await initRedis();

    // 4. Start server
    app.listen(PORT, () => {
      console.log(`🔐 Auth Service running on port ${PORT}---`);
      console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

startup();

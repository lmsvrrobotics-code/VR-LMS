import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  try {
    console.log('🚀 Running database migrations...');

    const migrationPath = path.join(__dirname, 'migrations', '001-create-indexes.sql');
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.warn('⚠️  DATABASE_URL not set, skipping migrations');
      return;
    }

    // Run via psql CLI
    try {
      execSync(`psql "${databaseUrl}" -f "${migrationPath}"`, {
        stdio: 'inherit',
      });
      console.log('✅ Migrations complete');
    } catch (err) {
      console.warn('⚠️  Could not run psql (install psql to enable automatic migrations)');
      console.log('   Run manually: psql $DATABASE_URL -f src/db/migrations/001-create-indexes.sql');
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}

// Alternative: Run via node-postgres if psql unavailable
export async function runMigrationsViaPg() {
  // Declared outside the try so the finally block can always close it, including
  // when connect() itself throws.
  let client;
  try {
    const { Client } = await import('pg');
    client = new Client(process.env.DATABASE_URL);
    await client.connect();

    // Same reason as the afterConnect hook in db/index.js: the migration SQL
    // uses unqualified table names, which resolve via search_path — default
    // `public`, where these tables don't exist.
    await client.query(
      `SET search_path TO "${process.env.DB_SCHEMA || 'lucy_devdb'}", public`
    );

    const migrationPath = path.join(__dirname, 'migrations', '001-create-indexes.sql');
    const { readFileSync } = await import('fs');
    const sql = readFileSync(migrationPath, 'utf-8');

    // Strip line comments BEFORE splitting. Comments in this file sit above the
    // statement they describe, so after a naive split on ';' each chunk begins
    // with "\n-- ...\nCREATE INDEX ...". The old `startsWith('--')` guard never
    // matched that (the chunk starts with a newline), so comment text was sent
    // to Postgres as part of the statement.
    const statements = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await client.query(statement);
      console.log(`✅ ${statement.substring(0, 50)}...`);
    }

    console.log('✅ All migrations complete');
  } catch (err) {
    // Do NOT swallow this. Indexes are a performance concern, not a correctness
    // one, so a failure must not stop auth-service from serving logins — but the
    // previous `console.error` alone left a broken migration looking identical
    // to a healthy startup, which is how this file shipped indexing columns that
    // do not exist. Make it unmissable and report it to Sentry.
    console.error(
      `❌ MIGRATION FAILED — indexes are missing, queries will fall back to sequential scans. ` +
        `Fix required: ${err.message}`,
    );
    const Sentry = await import('@sentry/node').catch(() => null);
    Sentry?.captureException?.(err);
  } finally {
    // The old code only closed the client on the success path, so every failed
    // run leaked an open Postgres connection for the life of the process.
    await client?.end().catch(() => {});
  }
}

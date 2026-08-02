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
  try {
    const { Client } = await import('pg');
    const client = new Client(process.env.DATABASE_URL);
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

    // Split into statements (crude but works for migrations)
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (statement.trim().startsWith('--')) continue;
      await client.query(statement);
      console.log(`✅ ${statement.substring(0, 50)}...`);
    }

    await client.end();
    console.log('✅ All migrations complete');
  } catch (err) {
    console.error('Migration error:', err);
  }
}

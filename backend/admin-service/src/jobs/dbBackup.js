// Nightly logical DB backup → Cloudflare R2.
//
// WHY THIS EXISTS: Supabase PITR / scheduled backups are a dashboard/plan
// feature we can't guarantee from code. This job makes the app own its
// restore points: every table in lms_admin + lucy_devdb is exported as
// gzipped NDJSON to the R2 bucket the app already uses, under
//   db-backups/<YYYY-MM-DD>/<schema>.<table>.ndjson.gz
// plus a manifest.json with row counts. Restore = re-run the SQL migrations
// (schema) + src/scripts/restoreTable.js per file (data).
//
// This complements — does not replace — Supabase PITR; enable that too when
// the plan allows. Belt and braces for the one unrecoverable failure mode.
//
// Config (env):
//   DB_BACKUP_DISABLED=true          → turn the scheduler off
//   DB_BACKUP_RETENTION_DAYS=14      → how many daily snapshots to keep
//   DB_BACKUP_HOUR=2                 → local hour (0-23) the nightly run fires
const zlib = require('zlib');
const { QueryTypes } = require('sequelize');
const env = require('../config/env');
const sequelize = require('../config/database');
const r2 = require('../services/R2Storage');

const PREFIX = 'db-backups/';
const BATCH = 5000; // rows per SELECT page — bounds memory on big tables
const SCHEMAS = ['lms_admin', 'lucy_devdb'];

const r2Configured = () => Boolean(env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket);
const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

let running = false;

const listTables = async (schema) => {
    // NOTE the `AS tname` alias: a bare `SELECT table_name FROM
    // information_schema.tables` matches Sequelize's internal showTables query
    // signature and gets its results collapsed to bare arrays — aliasing the
    // column keeps the normal object row shape.
    const rows = await sequelize.query(
        `SELECT table_name AS tname FROM information_schema.tables
          WHERE table_schema = :schema AND table_type = 'BASE TABLE'
          ORDER BY table_name`,
        { replacements: { schema }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => r.tname).filter(Boolean);
};

// Export one table as gzipped NDJSON and upload. Returns the row count.
const dumpTable = async (schema, table, date) => {
    const lines = [];
    let offset = 0;
    for (;;) {
        // Fully-qualified + quoted — independent of search_path. ORDER BY ctid
        // is REQUIRED: LIMIT/OFFSET without an order lets Postgres return
        // pages in arbitrary order, silently skipping/duplicating rows across
        // pages — a corrupt backup that looks fine. ctid gives a stable scan
        // order without assuming any table has an `id` column.
        const rows = await sequelize.query(
            `SELECT row_to_json(t) AS j FROM "${schema}"."${table}" t ORDER BY t.ctid LIMIT :lim OFFSET :off`,
            { replacements: { lim: BATCH, off: offset }, type: QueryTypes.SELECT },
        );
        for (const r of rows) lines.push(JSON.stringify(r.j));
        if (rows.length < BATCH) break;
        offset += BATCH;
    }
    const buf = zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf8'));
    await r2.uploadBuffer(buf, `${PREFIX}${date}/${schema}.${table}.ndjson.gz`, 'application/gzip');
    return lines.length;
};

// Full snapshot of both schemas → R2. Safe to call repeatedly (overwrites
// the same date's objects). Returns the manifest.
const runBackup = async () => {
    if (!r2Configured()) throw new Error('R2 is not configured — backups need R2_* env vars');
    if (running) return { skipped: 'already running' };
    running = true;
    const startedAt = Date.now();
    const date = today();
    const manifest = { date, startedAt: new Date().toISOString(), tables: {}, errors: [] };
    try {
        for (const schema of SCHEMAS) {
            const tables = await listTables(schema);
            for (const table of tables) {
                try {
                    manifest.tables[`${schema}.${table}`] = await dumpTable(schema, table, date);
                } catch (e) {
                    // One bad table must not sink the snapshot — record and move on.
                    manifest.errors.push(`${schema}.${table}: ${e.message}`);
                }
            }
        }
        manifest.tookMs = Date.now() - startedAt;
        await r2.uploadBuffer(
            Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
            `${PREFIX}${date}/manifest.json`, 'application/json',
        );
        const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
        console.log(`[db-backup] ${date}: ${Object.keys(manifest.tables).length} tables, ${total} rows, ${manifest.tookMs}ms`
            + (manifest.errors.length ? ` — ${manifest.errors.length} table error(s)` : ''));
        await prune().catch((e) => console.warn('[db-backup] prune failed:', e.message));
        return manifest;
    } finally {
        running = false;
    }
};

// Delete snapshot folders older than the retention window.
const prune = async () => {
    const keep = Math.max(2, Number(process.env.DB_BACKUP_RETENTION_DAYS || 14));
    const cutoff = new Date(Date.now() - keep * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const objects = await r2.listKeys(PREFIX);
    const stale = objects.filter((o) => {
        const date = o.key.slice(PREFIX.length, PREFIX.length + 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < cutoff;
    });
    for (const o of stale) await r2.deleteFile(o.key);
    if (stale.length) console.log(`[db-backup] pruned ${stale.length} object(s) older than ${cutoff}`);
};

// Has today's snapshot already been taken? (manifest exists)
const ranToday = async () => {
    const keys = await r2.listKeys(`${PREFIX}${today()}/manifest.json`);
    return keys.length > 0;
};

// Scheduler: checks hourly; fires once per day at DB_BACKUP_HOUR (local).
// Also catches up on boot — if the service was down at the scheduled hour,
// the first hourly tick after boot takes the missed snapshot.
const start = () => {
    if (process.env.DB_BACKUP_DISABLED === 'true') {
        console.log('[db-backup] disabled via DB_BACKUP_DISABLED');
        return;
    }
    if (!r2Configured()) {
        console.warn('[db-backup] R2 not configured — nightly DB backups OFF (set R2_* envs to enable)');
        return;
    }
    const hour = Math.min(23, Math.max(0, Number(process.env.DB_BACKUP_HOUR || 2)));
    const tick = async () => {
        try {
            if (new Date().getHours() < hour) return; // wait for the scheduled hour
            if (await ranToday()) return;
            await runBackup();
        } catch (e) {
            console.warn('[db-backup] run failed (will retry next tick):', e.message);
        }
    };
    setInterval(tick, 60 * 60 * 1000).unref();
    // First check shortly after boot (don't compete with boot DB work).
    setTimeout(tick, 90 * 1000).unref();
    console.log(`[db-backup] nightly backup scheduled (hour=${hour}, retention=${process.env.DB_BACKUP_RETENTION_DAYS || 14}d) → r2://${env.r2.bucket}/${PREFIX}`);
};

module.exports = { start, runBackup, prune, ranToday };

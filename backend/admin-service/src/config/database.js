const { Sequelize } = require('sequelize');
const env = require('./env');

// Primary admin-service DB handle. Was MySQL (lms_admin) on AWS RDS;
// now Supabase Postgres with schema `lms_admin`. Existing models reference
// snake_case columns (created_at / updated_at) and freezeTableName=true —
// no model code needs to change for the dialect swap.
const dbSchema = env.db.schema || 'lms_admin';

const baseOptions = {
    dialect: 'postgres',
    logging: false,
    schema: dbSchema,
    define: { underscored: false, freezeTableName: true },
    // Pool sizing for ~500 concurrent students: requests hold a connection for
    // only a few ms, so 20 connections per instance is comfortable headroom.
    // DATABASE_URL should point at the Supabase POOLER (pgbouncer) so instances
    // × pool never exhausts real Postgres connections. Tune via DB_POOL_MAX
    // without a code change (e.g. more replicas → smaller per-instance pool).
    pool: { max: Number(process.env.DB_POOL_MAX || 20), min: 0, acquire: 60000, idle: 10000, evict: 15000 },
    retry: {
        max: 3,
        match: [
            /ECONNRESET/, /ETIMEDOUT/, /EHOSTUNREACH/,
            /SequelizeConnectionError/, /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/, /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/, /SequelizeConnectionTimedOutError/,
        ],
    },
    dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
        // Belt-and-braces with the afterConnect hook below: send search_path
        // as a STARTUP parameter too. The hook's `SET` is session state, which
        // a transaction-mode pooler (Supabase :6543) may reset between
        // transactions; a startup parameter is applied per real connection.
        // Prefer the SESSION pooler (:5432) in DATABASE_URL regardless — see
        // RAILWAY_DEPLOY.md.
        options: `-c search_path="${dbSchema}",public`,
    },
    // `schema` scopes only model queries; raw SQL (BatchService, StudentService,
    // …) uses unqualified table names that resolve via search_path. Pin it so
    // those raw queries land in lms_admin instead of the default public schema.
    hooks: {
        afterConnect: async (connection) => {
            await connection.query(`SET search_path TO "${dbSchema}", public`);
        },
    },
};

const sequelize = env.db.url
    ? new Sequelize(env.db.url, baseOptions)
    : new Sequelize(env.db.name, env.db.user, env.db.pass, {
          host: env.db.host,
          port: env.db.port,
          ...baseOptions,
      });

module.exports = sequelize;

const { Sequelize } = require('sequelize');
const env = require('./env');

/**
 * Read-only Sequelize handle pointed at the assessment-service tables
 * (lucy_devdb.pre_assessment_registrations) on Supabase Postgres. Used by
 * Manage Students to surface the selectedProgram value the student picked
 * on the pre-assessment onboarding form.
 *
 * On Supabase both auth + assessment tables live in the same physical DB
 * (lucy_devdb schema) — this handle exists as a separate slot so it can
 * be re-pointed at a different DB without code changes.
 */
const assessmentSchema = env.assessmentDb.schema || 'lucy_devdb';

const baseOptions = {
    dialect: 'postgres',
    logging: false,
    schema: assessmentSchema,
    define: { underscored: false, freezeTableName: true },
    pool: { max: 5, min: 0, acquire: 60000, idle: 10000 },
    retry: {
        max: 2,
        match: [/ECONNRESET/, /ETIMEDOUT/, /SequelizeConnectionError/],
    },
    dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
        // Startup-parameter search_path — survives transaction-pooler session
        // resets that would drop the afterConnect SET (see database.js).
        options: `-c search_path="${assessmentSchema}",public`,
    },
    // Pin search_path so raw queries (Manage Students' selectedProgram join)
    // resolve to lucy_devdb rather than the default public schema.
    hooks: {
        afterConnect: async (connection) => {
            await connection.query(`SET search_path TO "${assessmentSchema}", public`);
        },
    },
};

const assessmentSequelize = env.assessmentDb.url
    ? new Sequelize(env.assessmentDb.url, baseOptions)
    : new Sequelize(env.assessmentDb.name, env.assessmentDb.user, env.assessmentDb.pass, {
          host: env.assessmentDb.host,
          port: env.assessmentDb.port,
          ...baseOptions,
      });

module.exports = assessmentSequelize;

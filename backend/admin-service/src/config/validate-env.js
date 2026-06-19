/**
 * Enhanced environment variable validation
 * Run this early in server.js before any services initialize
 * Usage: require('./config/validate-env');
 */

const joi = require('joi');

// Define schema for critical variables
const schema = joi.object({
  NODE_ENV: joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: joi.string().uri().required(),
  SUPABASE_JWT_SECRET: joi.string().min(32),
  R2_ACCOUNT_ID: joi.string().required(),
  R2_ACCESS_KEY_ID: joi.string().required(),
  R2_SECRET_ACCESS_KEY: joi.string().required(),
  R2_BUCKET_NAME: joi.string().required(),
  BUNNY_STREAM_LIBRARY_ID: joi.string().required(),
  BUNNY_STREAM_API_KEY: joi.string().required(),
}).unknown(true);

/**
 * Validate environment on startup
 * Throws if required vars are missing
 */
function validateEnvironment() {
  const { error, value } = schema.validate(process.env, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    console.error('\n❌ ENVIRONMENT VALIDATION FAILED\n');
    console.error('Missing or invalid environment variables:\n');

    error.details.forEach(detail => {
      const field = detail.path.join('.');
      const reason = detail.message.replace(/"/g, "'");
      console.error(`  ❌ ${field}: ${reason}`);
    });

    console.error('\n📋 Required Variables:');
    console.error('  - DATABASE_URL (Supabase connection string)');
    console.error('  - SUPABASE_JWT_SECRET (>= 32 chars for production)');
    console.error('  - R2_* (Cloudflare credentials)');
    console.error('  - BUNNY_STREAM_* (Bunny Stream credentials)');
    console.error('\n✅ Run: cp credentials.env .env (then update with your values)\n');

    process.exit(1);
  }

  return value;
}

// Validate on require
validateEnvironment();

console.log('✅ Environment validation passed');

module.exports = { validateEnvironment };

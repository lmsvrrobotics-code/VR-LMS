-- Indexes for the auth-service hot paths.
-- Run: psql -d $DATABASE_URL -f src/db/migrations/001-create-indexes.sql
--
-- Identifiers are double-quoted because lucy_devdb uses camelCase column names.
-- Unquoted identifiers are folded to lower case by Postgres, so users(userId)
-- resolves to a non-existent "userid" and the statement fails with 42703.
--
-- Every index below was verified against information_schema before being added.
-- An earlier revision of this file indexed audit_logs, sessions and user_roles
-- plus users.id / users.created_at / users.email_verified / users.active — none
-- of which exist in this schema. Those statements failed on every startup and
-- the error was swallowed, so the indexes silently never existed. Do not add an
-- index here without confirming the table and column are real.

-- Users: login looks up by email, most listings order by createdAt.
CREATE INDEX IF NOT EXISTS idx_users_email ON users("email");
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users("userId");
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users("createdAt" DESC);

-- Roles: resolved by name on every authorization check.
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles("role");

-- Refresh planner statistics for the tables touched above.
ANALYZE users;
ANALYZE roles;

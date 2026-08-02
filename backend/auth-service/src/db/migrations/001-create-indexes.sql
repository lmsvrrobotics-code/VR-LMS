-- Critical indexes for 1k+ concurrent users
-- Run: psql -d $DATABASE_URL -f src/db/migrations/001-create-indexes.sql

-- Users table indexes (most frequent queries)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email, email_verified);

-- Roles table
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(role);

-- Audit logs (for compliance queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created ON audit_logs(user_id, created_at DESC);

-- Sessions/tokens (if you have them)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Foreign key relationships
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- Composite indexes for common WHERE + ORDER BY patterns
CREATE INDEX IF NOT EXISTS idx_users_active_email ON users(active, email) WHERE active = true;

-- Unique constraints (also act as indexes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);

-- Analyze to update query planner
ANALYZE;

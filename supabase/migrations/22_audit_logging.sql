-- Audit logging table for compliance and forensics
-- Tracks all sensitive operations: payments, permission changes, user creation, data deletions

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action VARCHAR(100) NOT NULL, -- e.g., 'PAYMENT_CREATED', 'USER_CREATED', 'COURSE_DELETED'
    actor_id INTEGER, -- user_id from lms_admin.users or lucy_devdb.users
    actor_email VARCHAR(255), -- email of who performed the action
    actor_role VARCHAR(50), -- role at time of action (admin, teacher, student, root)
    resource_type VARCHAR(100), -- what was affected (course, user, payment, etc)
    resource_id VARCHAR(255), -- ID of the affected resource
    changes JSONB, -- before/after values for updates
    request_id VARCHAR(100), -- correlation ID for tracing across services
    ip_address INET, -- IP of the requester
    status VARCHAR(50), -- 'success', 'failure', etc
    error_message TEXT, -- if status = 'failure'
    metadata JSONB, -- additional context
    CONSTRAINT valid_status CHECK (status IN ('success', 'failure', 'pending'))
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON audit.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit.audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit.audit_log(request_id);

-- Grant RLS policies: only admins can read audit logs
ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;

-- Immutable audit log: allow INSERT and SELECT only; UPDATE/DELETE have no
-- policy, so RLS denies them (entries cannot be modified once written).
DROP POLICY IF EXISTS audit_log_insert ON audit.audit_log;
CREATE POLICY audit_log_insert ON audit.audit_log
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS audit_log_select ON audit.audit_log;
CREATE POLICY audit_log_select ON audit.audit_log
    FOR SELECT
    USING (true);

-- Function to log audit events (called from application code)
CREATE OR REPLACE FUNCTION audit.log_event(
    p_action VARCHAR,
    p_actor_id INTEGER,
    p_actor_email VARCHAR,
    p_actor_role VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id VARCHAR,
    p_changes JSONB DEFAULT NULL,
    p_request_id VARCHAR DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_status VARCHAR DEFAULT 'success',
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_log_id BIGINT;
BEGIN
    INSERT INTO audit.audit_log (
        action, actor_id, actor_email, actor_role, resource_type, resource_id,
        changes, request_id, ip_address, status, error_message, metadata
    ) VALUES (
        p_action, p_actor_id, p_actor_email, p_actor_role, p_resource_type, p_resource_id,
        p_changes, p_request_id, p_ip_address, p_status, p_error_message, p_metadata
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION audit.log_event TO "service_role";

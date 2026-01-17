-- Secrets Management Migration
-- Adds tables for encrypted secrets storage with audit logging
-- Run: psql $DATABASE_URL < data/migrations/003_add_secrets.sql

BEGIN;

-- ============================================
-- SECRETS TABLE
-- ============================================
-- Stores encrypted secrets with metadata
CREATE TABLE IF NOT EXISTS secrets (
    key TEXT PRIMARY KEY,
    encrypted_value TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    category TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_secrets_category ON secrets(category);

COMMENT ON TABLE secrets IS 'Encrypted secrets storage';
COMMENT ON COLUMN secrets.key IS 'Unique secret key (e.g., SLACK_BOT_TOKEN)';
COMMENT ON COLUMN secrets.encrypted_value IS 'AES-256-GCM encrypted value';
COMMENT ON COLUMN secrets.iv IS 'Initialization vector for decryption';
COMMENT ON COLUMN secrets.auth_tag IS 'Authentication tag for integrity verification';
COMMENT ON COLUMN secrets.category IS 'Optional category for grouping (e.g., slack, google)';

-- ============================================
-- SECRETS_AUDIT_LOG TABLE
-- ============================================
-- Audit trail for secret changes
CREATE TABLE IF NOT EXISTS secrets_audit_log (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    action TEXT NOT NULL,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_secrets_audit_key ON secrets_audit_log(key);
CREATE INDEX IF NOT EXISTS idx_secrets_audit_time ON secrets_audit_log(changed_at);

COMMENT ON TABLE secrets_audit_log IS 'Audit log for secret changes';
COMMENT ON COLUMN secrets_audit_log.action IS 'Action performed: created, updated, deleted';

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
DROP TRIGGER IF EXISTS update_secrets_updated_at ON secrets;
CREATE TRIGGER update_secrets_updated_at
    BEFORE UPDATE ON secrets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

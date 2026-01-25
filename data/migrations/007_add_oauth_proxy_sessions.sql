-- OAuth Proxy Sessions Migration
-- Adds table for storing temporary OAuth proxy sessions
-- Run: psql $DATABASE_URL < data/migrations/007_add_oauth_proxy_sessions.sql

BEGIN;

-- ============================================
-- OAUTH_PROXY_SESSIONS TABLE
-- ============================================
-- Stores temporary OAuth proxy sessions for external instances
-- that authenticate through production's shared OAuth client
CREATE TABLE IF NOT EXISTS oauth_proxy_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    code_challenge VARCHAR(256) NOT NULL,
    scopes TEXT[] NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    encrypted_tokens TEXT,
    user_email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_proxy_sessions_session_id ON oauth_proxy_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_oauth_proxy_sessions_status ON oauth_proxy_sessions(status);
CREATE INDEX IF NOT EXISTS idx_oauth_proxy_sessions_expires_at ON oauth_proxy_sessions(expires_at);

COMMENT ON TABLE oauth_proxy_sessions IS 'Temporary OAuth proxy sessions for external instances';
COMMENT ON COLUMN oauth_proxy_sessions.session_id IS 'Unique session identifier (random UUID)';
COMMENT ON COLUMN oauth_proxy_sessions.code_challenge IS 'PKCE code challenge (SHA256 hash of verifier)';
COMMENT ON COLUMN oauth_proxy_sessions.scopes IS 'Requested OAuth scopes';
COMMENT ON COLUMN oauth_proxy_sessions.status IS 'Session status: pending, completed, retrieved, expired';
COMMENT ON COLUMN oauth_proxy_sessions.encrypted_tokens IS 'AES-256-GCM encrypted tokens JSON';
COMMENT ON COLUMN oauth_proxy_sessions.user_email IS 'Email of authenticated user (for audit)';
COMMENT ON COLUMN oauth_proxy_sessions.expires_at IS 'Session expiration time (5 minutes from creation)';

COMMIT;

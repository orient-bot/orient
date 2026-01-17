-- Chat Context Persistence Migration
-- Adds table for persistent agent context storage per chat/channel
-- Run: psql $DATABASE_URL < data/migrations/002_add_chat_context.sql

BEGIN;

-- ============================================
-- CHAT_CONTEXT TABLE
-- ============================================
-- Persistent context storage for agent memory, user preferences, and activity history
CREATE TABLE IF NOT EXISTS chat_context (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,                  -- WhatsApp chat ID or Slack channel ID
    platform TEXT NOT NULL,                 -- 'whatsapp' | 'slack' | 'opencode' | 'cursor'
    context_json TEXT NOT NULL,             -- JSON: identity, userProfile, recentActivity, currentState
    version INTEGER DEFAULT 1,              -- Schema version for future migrations
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform, chat_id)               -- One context per platform+chat combination
);

CREATE INDEX IF NOT EXISTS idx_chat_context_lookup ON chat_context(platform, chat_id);

COMMENT ON TABLE chat_context IS 'Persistent agent context storage per chat/channel';
COMMENT ON COLUMN chat_context.chat_id IS 'WhatsApp chat ID or Slack channel ID (unified column)';
COMMENT ON COLUMN chat_context.platform IS 'Platform identifier: whatsapp, slack, opencode, cursor';
COMMENT ON COLUMN chat_context.context_json IS 'JSON containing identity, userProfile, recentActivity, currentState';
COMMENT ON COLUMN chat_context.version IS 'Schema version for context_json structure';

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
-- Reuses the update_updated_at_column() function from migration 001
-- If running standalone, ensure that function exists first

DROP TRIGGER IF EXISTS update_chat_context_updated_at ON chat_context;
CREATE TRIGGER update_chat_context_updated_at
    BEFORE UPDATE ON chat_context
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Agent Registry Migration
-- Adds tables for database-backed agent configuration
-- Run: psql $DATABASE_URL < data/migrations/001_add_agent_registry.sql

BEGIN;

-- ============================================
-- AGENTS TABLE
-- ============================================
-- Agent definitions (pm-assistant, communicator, etc.)
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,                    -- 'pm-assistant', 'communicator'
    name TEXT NOT NULL,                     -- Display name
    description TEXT,                       -- What this agent does
    mode TEXT DEFAULT 'primary',            -- 'primary' | 'specialized'
    model_default TEXT,                     -- 'anthropic/claude-sonnet-4-20250514'
    model_fallback TEXT,                    -- Fallback model
    base_prompt TEXT,                       -- System prompt for this agent
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE agents IS 'Agent definitions for the Agent Registry';
COMMENT ON COLUMN agents.id IS 'Unique agent identifier (e.g., pm-assistant)';
COMMENT ON COLUMN agents.mode IS 'Agent mode: primary (main agent) or specialized (delegate)';

-- ============================================
-- AGENT_SKILLS TABLE
-- ============================================
-- Skills available to each agent
CREATE TABLE IF NOT EXISTS agent_skills (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,               -- Skill name (matches skills/ folder name)
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, skill_name)            -- Each skill can only be assigned once per agent
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_name);

COMMENT ON TABLE agent_skills IS 'Skills assigned to each agent';

-- ============================================
-- AGENT_TOOLS TABLE
-- ============================================
-- Tool access patterns per agent (allow/deny)
CREATE TABLE IF NOT EXISTS agent_tools (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,                  -- 'ai_first_*', 'write', 'bash'
    type TEXT NOT NULL CHECK (type IN ('allow', 'deny')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, pattern, type)         -- Prevent duplicate rules
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_type ON agent_tools(type);

COMMENT ON TABLE agent_tools IS 'Tool access patterns (allow/deny) per agent';
COMMENT ON COLUMN agent_tools.pattern IS 'Tool pattern with wildcards (e.g., ai_first_*)';

-- ============================================
-- CONTEXT_RULES TABLE
-- ============================================
-- Context-based agent selection and skill overrides
CREATE TABLE IF NOT EXISTS context_rules (
    id SERIAL PRIMARY KEY,
    context_type TEXT NOT NULL,             -- 'default' | 'platform' | 'chat' | 'channel' | 'environment'
    context_id TEXT,                        -- chat_id, channel_id, 'prod', 'local', null for defaults
    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    skill_overrides TEXT,                   -- JSON array: '["disable:skill-name"]'
    priority INTEGER DEFAULT 0,             -- Higher priority wins
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_rules_type ON context_rules(context_type);
CREATE INDEX IF NOT EXISTS idx_context_rules_context ON context_rules(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_context_rules_agent ON context_rules(agent_id);
CREATE INDEX IF NOT EXISTS idx_context_rules_priority ON context_rules(priority);

COMMENT ON TABLE context_rules IS 'Context-based agent selection and skill overrides';
COMMENT ON COLUMN context_rules.context_type IS 'Rule scope: default, platform, chat, channel, or environment';
COMMENT ON COLUMN context_rules.priority IS 'Higher priority rules take precedence';
COMMENT ON COLUMN context_rules.skill_overrides IS 'JSON array of skill modifications';

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_context_rules_updated_at ON context_rules;
CREATE TRIGGER update_context_rules_updated_at
    BEFORE UPDATE ON context_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

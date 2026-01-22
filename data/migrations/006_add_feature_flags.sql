-- Migration: Feature Flags System
-- Description: Adds hierarchical feature flags with per-user overrides

-- Global feature flags (hierarchical IDs via naming convention)
CREATE TABLE IF NOT EXISTS feature_flags (
    id TEXT PRIMARY KEY,            -- e.g., 'mini_apps.edit_with_ai'
    name TEXT NOT NULL,             -- Display name: 'Edit with AI'
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    category TEXT DEFAULT 'ui',     -- For UI grouping
    sort_order INTEGER DEFAULT 0,   -- For consistent ordering
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Per-user overrides
CREATE TABLE IF NOT EXISTS user_feature_flag_overrides (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
    flag_id TEXT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, flag_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON feature_flags(category);
CREATE INDEX IF NOT EXISTS idx_feature_flags_sort_order ON feature_flags(sort_order);
CREATE INDEX IF NOT EXISTS idx_user_flag_overrides_user ON user_feature_flag_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_flag_overrides_flag ON user_feature_flag_overrides(flag_id);

-- Seed initial flags (parents first, then children)
-- Default: Everything ON except monitoring and mini-apps
INSERT INTO feature_flags (id, name, description, enabled, category, sort_order) VALUES
    -- Mini-Apps section (DISABLED by default)
    ('mini_apps', 'Mini-Apps', 'AI-generated web applications', false, 'ui', 10),
    ('mini_apps.create', 'Create App', 'Create new mini-apps', false, 'ui', 11),
    ('mini_apps.edit_with_ai', 'Edit with AI', 'AI-powered app editing', false, 'ui', 12),
    ('mini_apps.share', 'Share Apps', 'Share and publish apps', false, 'ui', 13),

    -- Monitoring section (DISABLED by default)
    ('monitoring', 'Monitoring', 'Server monitoring and metrics', false, 'operations', 20),
    ('monitoring.server_health', 'Server Health', 'Server health status card', false, 'operations', 21),

    -- Agent Registry section (ENABLED)
    ('agent_registry', 'Agent Registry', 'Agent configuration management', true, 'ui', 30),
    ('agent_registry.edit', 'Edit Agents', 'Modify agent settings', true, 'ui', 31),

    -- Automation section (ENABLED)
    ('automation', 'Automation', 'Schedules and webhooks', true, 'automation', 40),
    ('automation.schedules', 'Schedules', 'Scheduled messages', true, 'automation', 41),
    ('automation.webhooks', 'Webhooks', 'Webhooks management', true, 'automation', 42),

    -- Operations section (ENABLED)
    ('operations', 'Operations', 'Server operations and management', true, 'operations', 45),
    ('storage', 'Storage', 'Database and media storage', true, 'operations', 50),
    ('billing', 'Billing', 'Usage and cost tracking', true, 'operations', 60)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order;

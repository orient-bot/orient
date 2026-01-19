-- Migration: Add user_version_preferences table
-- Description: Stores user preferences for version update notifications

CREATE TABLE IF NOT EXISTS user_version_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES dashboard_users(id) ON DELETE CASCADE,
    notifications_enabled BOOLEAN DEFAULT true,
    dismissed_versions TEXT[] DEFAULT '{}',
    remind_later_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_version_prefs_user ON user_version_preferences(user_id);

-- Add comment for documentation
COMMENT ON TABLE user_version_preferences IS 'Stores user preferences for version update notifications including dismissed versions and remind-later settings';

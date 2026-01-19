-- Track one-time onboarding events per workspace
CREATE TABLE IF NOT EXISTS workspace_onboarding (
    id SERIAL PRIMARY KEY,
    onboarding_type TEXT NOT NULL UNIQUE,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    triggered_by TEXT,
    metadata JSONB
);

CREATE INDEX idx_onboarding_type ON workspace_onboarding(onboarding_type);

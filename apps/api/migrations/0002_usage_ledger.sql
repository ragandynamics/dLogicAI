ALTER TABLE usage_events ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE usage_events ADD COLUMN request_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE usage_events ADD COLUMN completed_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_request_id
ON usage_events(request_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_period
ON usage_events(tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_status_period
ON usage_events(tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_project_period
ON usage_events(project_id, created_at);
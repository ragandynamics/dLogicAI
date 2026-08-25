ALTER TABLE sessions ADD COLUMN tenant_id TEXT;

CREATE INDEX IF NOT EXISTS sessions_tenant_idx ON sessions(tenant_id);

ALTER TABLE conversations ADD COLUMN auto_response_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN paused_by TEXT;
ALTER TABLE conversations ADD COLUMN paused_at INTEGER;

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant
  ON tenant_invitations(tenant_id, status, created_at DESC);

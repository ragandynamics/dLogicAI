CREATE TABLE IF NOT EXISTS tenant_llm_credentials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_llm_credentials_status
  ON tenant_llm_credentials(tenant_id, status);

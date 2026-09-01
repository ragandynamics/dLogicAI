CREATE TABLE IF NOT EXISTS chat_service_channels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chat_service_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(chat_service_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_chat_service_channels_project
  ON chat_service_channels(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_service_channels_tenant
  ON chat_service_channels(tenant_id, created_at DESC);

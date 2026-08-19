CREATE TABLE IF NOT EXISTS chat_services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  environment TEXT NOT NULL DEFAULT 'development',
  status TEXT NOT NULL DEFAULT 'active',
  default_language TEXT NOT NULL DEFAULT 'auto',
  ai_provider TEXT NOT NULL DEFAULT 'auto',
  model TEXT NOT NULL DEFAULT 'auto',
  enable_intelligence INTEGER NOT NULL DEFAULT 1,
  enable_emotion_analysis INTEGER NOT NULL DEFAULT 1,
  enable_upsell_analysis INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_services_tenant
  ON chat_services(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_services_project
  ON chat_services(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_services_status
  ON chat_services(tenant_id, status);

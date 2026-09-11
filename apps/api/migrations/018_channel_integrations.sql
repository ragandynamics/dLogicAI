CREATE TABLE IF NOT EXISTS channel_installations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chat_service_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('telegram', 'whatsapp')),
  external_account_id TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  webhook_secret_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, channel, external_account_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_service_id) REFERENCES chat_services(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS channel_installations_scope_idx ON channel_installations(tenant_id, project_id, channel);

CREATE TABLE IF NOT EXISTS channel_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_code TEXT,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE(installation_id, external_event_id),
  FOREIGN KEY (installation_id) REFERENCES channel_installations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS channel_events_tenant_idx ON channel_events(tenant_id, received_at DESC);

CREATE TABLE IF NOT EXISTS channel_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chat_service_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  external_conversation_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(installation_id, external_conversation_id),
  FOREIGN KEY (installation_id) REFERENCES channel_installations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS channel_conversations_tenant_idx ON channel_conversations(tenant_id, project_id, chat_service_id);

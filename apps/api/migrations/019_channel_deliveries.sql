CREATE TABLE IF NOT EXISTS channel_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  external_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  delivered_at INTEGER,
  read_at INTEGER,
  FOREIGN KEY (installation_id) REFERENCES channel_installations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS channel_deliveries_conversation_idx ON channel_deliveries(tenant_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS channel_deliveries_retry_idx ON channel_deliveries(status, attempt_count, created_at);

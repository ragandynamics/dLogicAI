CREATE TABLE IF NOT EXISTS conversation_flow_state (
  conversation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chat_service_id TEXT NOT NULL,
  flow_version_id TEXT NOT NULL,
  current_state_key TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  slots_json TEXT NOT NULL DEFAULT '{}',
  milestones_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conversation_flow_state_scope_idx
  ON conversation_flow_state(tenant_id, project_id, chat_service_id);

CREATE TABLE IF NOT EXISTS conversation_milestone_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  flow_version_id TEXT NOT NULL,
  milestone_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(conversation_id, flow_version_id, milestone_key),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conversation_milestones_tenant_idx
  ON conversation_milestone_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_outcome_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  flow_version_id TEXT NOT NULL,
  outcome_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(conversation_id, flow_version_id, outcome_key),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conversation_outcomes_tenant_idx
  ON conversation_outcome_events(tenant_id, created_at DESC);

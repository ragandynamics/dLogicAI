CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS knowledge_bases_tenant_idx ON knowledge_bases(tenant_id, project_id);

CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  knowledge_base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT,
  source_uri TEXT,
  storage_key TEXT,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS knowledge_documents_scope_idx ON knowledge_base_documents(tenant_id, project_id, knowledge_base_id);

CREATE TABLE IF NOT EXISTS chat_service_knowledge_bases (
  chat_service_id TEXT NOT NULL,
  knowledge_base_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_service_id, knowledge_base_id),
  FOREIGN KEY (chat_service_id) REFERENCES chat_services(id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chat_service_knowledge_tenant_idx ON chat_service_knowledge_bases(tenant_id, chat_service_id);

CREATE TABLE IF NOT EXISTS dialog_flows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chat_service_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active_version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_service_id) REFERENCES chat_services(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS dialog_flows_tenant_idx ON dialog_flows(tenant_id, project_id);

CREATE TABLE IF NOT EXISTS dialog_flow_versions (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  entry_state_key TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(flow_id, version),
  FOREIGN KEY (flow_id) REFERENCES dialog_flows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dialog_states (
  id TEXT PRIMARY KEY,
  flow_version_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_type TEXT NOT NULL,
  goal TEXT,
  prompt TEXT NOT NULL,
  required_slots_json TEXT NOT NULL DEFAULT '[]',
  knowledge_base_ids_json TEXT NOT NULL DEFAULT '[]',
  max_retries INTEGER NOT NULL DEFAULT 2,
  UNIQUE(flow_version_id, state_key),
  FOREIGN KEY (flow_version_id) REFERENCES dialog_flow_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dialog_transitions (
  id TEXT PRIMARY KEY,
  flow_version_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  from_state_key TEXT NOT NULL,
  to_state_key TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (flow_version_id) REFERENCES dialog_flow_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dialog_outcomes (
  id TEXT PRIMARY KEY,
  flow_version_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  outcome_key TEXT NOT NULL,
  label TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(flow_version_id, outcome_key),
  FOREIGN KEY (flow_version_id) REFERENCES dialog_flow_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS dialog_flow_versions_tenant_idx ON dialog_flow_versions(tenant_id, flow_id, version DESC);

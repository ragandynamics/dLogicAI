INSERT OR IGNORE INTO connector_catalog (id,key,name,description,active,created_at,updated_at)
VALUES ('conn_business_api','business_api','Business API','Scoped business records, live lookups and approved actions.',1,unixepoch()*1000,unixepoch()*1000);

CREATE TABLE business_connectors (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL, config_json TEXT NOT NULL, encrypted_credentials TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'configured' CHECK(status IN ('configured','active','disabled')),
 tested_at INTEGER, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(tenant_id,project_id,name)
);
CREATE TABLE business_connector_bindings (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 service_id TEXT NOT NULL REFERENCES chat_services(id) ON DELETE CASCADE,
 connector_id TEXT NOT NULL REFERENCES business_connectors(id) ON DELETE CASCADE,
 live INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(service_id,connector_id)
);
CREATE TABLE business_connector_records (
 connector_id TEXT NOT NULL REFERENCES business_connectors(id) ON DELETE CASCADE,
 external_id TEXT NOT NULL, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('public','customer')),
 subject TEXT, title TEXT NOT NULL, content TEXT NOT NULL, source_url TEXT,
 version INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(connector_id,external_id)
);
CREATE INDEX business_record_scope ON business_connector_records(tenant_id,project_id,connector_id,visibility,subject,expires_at);
CREATE TABLE business_connector_receipts (
 connector_id TEXT NOT NULL REFERENCES business_connectors(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, claim_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(connector_id,event_id)
);
ALTER TABLE web_widget_sessions ADD COLUMN business_identity_hash TEXT;
CREATE TABLE business_connector_runs (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 connector_id TEXT NOT NULL REFERENCES business_connectors(id) ON DELETE CASCADE,
 operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('reserved','completed','failed','unknown')),
 encrypted_result TEXT, error_code TEXT, period_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, completed_at INTEGER,
 included_calls INTEGER NOT NULL DEFAULT 0, unit_price_micros INTEGER NOT NULL DEFAULT 0, period_end INTEGER NOT NULL DEFAULT 0,
 UNIQUE(tenant_id,connector_id,idempotency_key)
);
CREATE TABLE business_connector_sync (
 connector_id TEXT PRIMARY KEY REFERENCES business_connectors(id) ON DELETE CASCADE,
 cursor TEXT NOT NULL DEFAULT '', cycle TEXT NOT NULL, next_at INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER business_record_limit BEFORE INSERT ON business_connector_records
 WHEN NOT EXISTS(SELECT 1 FROM business_connector_records WHERE connector_id=NEW.connector_id AND external_id=NEW.external_id)
 AND (SELECT COUNT(*) FROM business_connector_records WHERE connector_id=NEW.connector_id)>=
 (SELECT COALESCE(json_extract(config_json,'$.max_records'),5000) FROM business_connectors WHERE id=NEW.connector_id)
 BEGIN SELECT RAISE(ABORT,'CONNECTOR_RECORD_LIMIT'); END;
CREATE TABLE business_connector_meters (
 tenant_id TEXT NOT NULL, period_start INTEGER NOT NULL,
 pending INTEGER NOT NULL DEFAULT 0 CHECK(pending>=0), used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),
 PRIMARY KEY(tenant_id,period_start)
);
CREATE TABLE business_connector_actions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 connector_id TEXT NOT NULL REFERENCES business_connectors(id) ON DELETE CASCADE,
 service_id TEXT NOT NULL, conversation_id TEXT, operation TEXT NOT NULL,
 encrypted_input TEXT NOT NULL, request_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','running','completed','failed','unknown','cancelled')),
 approved_by TEXT, approved_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(tenant_id,idempotency_key)
);

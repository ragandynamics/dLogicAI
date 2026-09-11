CREATE TABLE interactive_forms (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, service_id TEXT NOT NULL,
 draft_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, published_version INTEGER,
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN(0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX interactive_forms_scope ON interactive_forms(tenant_id,project_id,service_id);
CREATE TABLE form_versions (
 form_id TEXT NOT NULL, version INTEGER NOT NULL, schema_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(form_id,version)
);
CREATE TABLE form_sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, form_id TEXT NOT NULL, version INTEGER NOT NULL,
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, test INTEGER NOT NULL CHECK(test IN(0,1)),
 encrypted_answers TEXT, revision INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'started' CHECK(status IN('started','reviewed','submitted')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, submitted_at INTEGER, retain_until INTEGER NOT NULL
);
CREATE INDEX form_submissions_scope ON form_sessions(tenant_id,project_id,form_id,created_at);
-- Implementation readiness never silently activates a previously unavailable feature.
INSERT OR IGNORE INTO platform_settings(key,value_json,version,updated_by,updated_at)
VALUES('feature.forms','{"enabled":false,"stop":"immediate","reason":"Awaiting platform activation"}',1,'migration',0);

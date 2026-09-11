-- Staff identity is separate from tenant membership. Bootstrap grants explicitly.
CREATE TABLE IF NOT EXISTS platform_staff (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 role TEXT NOT NULL CHECK(role IN ('platformadmin','operations','billing')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_cases (
 source TEXT NOT NULL CHECK(source IN ('problem','contact')),
 source_id TEXT NOT NULL,
 assigned_team TEXT NOT NULL DEFAULT 'operations' CHECK(assigned_team IN ('platformadmin','operations','billing')),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','in_progress','waiting','resolved','closed')),
 version INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(source,source_id)
);
CREATE TABLE IF NOT EXISTS platform_case_updates (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT NOT NULL,
 actor TEXT NOT NULL, assigned_team TEXT NOT NULL, status TEXT NOT NULL,
 note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_case_updates_case ON platform_case_updates(source,source_id,created_at);
CREATE TABLE IF NOT EXISTS platform_settings (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, role TEXT NOT NULL, portal TEXT NOT NULL,
 action TEXT NOT NULL, resource TEXT NOT NULL, request_id TEXT NOT NULL,
 details_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_audit_time ON platform_audit(created_at DESC,id DESC);
INSERT OR IGNORE INTO platform_settings VALUES ('platform','{"ai_enabled":true,"support_email":""}',0,'migration',0);

CREATE TABLE web_widgets_new (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 chat_service_id TEXT NOT NULL, config_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 FOREIGN KEY(chat_service_id) REFERENCES chat_services(id) ON DELETE CASCADE
);
INSERT INTO web_widgets_new SELECT * FROM web_widgets;
CREATE TABLE web_widget_sessions_new (
 token_hash TEXT PRIMARY KEY, widget_id TEXT NOT NULL, origin TEXT NOT NULL,
 conversation_id TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
 locked_until INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(widget_id) REFERENCES web_widgets_new(id) ON DELETE CASCADE
);
INSERT INTO web_widget_sessions_new SELECT * FROM web_widget_sessions;
DROP TABLE web_widget_sessions;
DROP TABLE web_widgets;
ALTER TABLE web_widgets_new RENAME TO web_widgets;
ALTER TABLE web_widget_sessions_new RENAME TO web_widget_sessions;
CREATE INDEX web_widgets_service_idx ON web_widgets(tenant_id, project_id, chat_service_id, created_at DESC);
CREATE INDEX web_widget_sessions_expiry ON web_widget_sessions(expires_at);

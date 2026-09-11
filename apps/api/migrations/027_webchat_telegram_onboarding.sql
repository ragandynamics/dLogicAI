-- Public widget records are separate from legacy channel configuration: no
-- existing web channel is made publicly callable by applying this migration.
CREATE TABLE web_widgets (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 chat_service_id TEXT NOT NULL, config_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(chat_service_id),
 FOREIGN KEY(chat_service_id) REFERENCES chat_services(id) ON DELETE CASCADE
);
CREATE TABLE web_widget_sessions (
 token_hash TEXT PRIMARY KEY, widget_id TEXT NOT NULL, origin TEXT NOT NULL,
 conversation_id TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
 locked_until INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(widget_id) REFERENCES web_widgets(id) ON DELETE CASCADE
);
CREATE INDEX web_widget_sessions_expiry ON web_widget_sessions(expires_at);
CREATE TABLE channel_rate_limits (
 key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL
);
CREATE TABLE telegram_onboarding (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 chat_service_id TEXT NOT NULL, user_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, telegram_user_id TEXT, telegram_name TEXT,
 status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL,
 installation_id TEXT, bot_id TEXT, created_at INTEGER NOT NULL,
 FOREIGN KEY(chat_service_id) REFERENCES chat_services(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX telegram_onboarding_identity ON telegram_onboarding(telegram_user_id)
 WHERE status IN ('linked','ready','processing');

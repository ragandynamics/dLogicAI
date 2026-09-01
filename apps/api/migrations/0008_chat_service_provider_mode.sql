ALTER TABLE chat_services ADD COLUMN provider_mode TEXT NOT NULL DEFAULT 'managed';
ALTER TABLE chat_services ADD COLUMN provider_credential_id TEXT;

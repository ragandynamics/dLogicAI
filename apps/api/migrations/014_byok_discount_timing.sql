ALTER TABLE subscriptions ADD COLUMN byok_discount_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN byok_discount_effective_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN byok_discount_applied_at INTEGER;
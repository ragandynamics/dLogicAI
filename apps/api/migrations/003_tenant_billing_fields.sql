ALTER TABLE tenants ADD COLUMN billing_email TEXT;
ALTER TABLE tenants ADD COLUMN external_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_external_customer_id
	ON subscriptions(external_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_external_subscription_id
	ON subscriptions(external_subscription_id);


-- dLogicAI Stripe Billing integration
-- Apply after the existing D1 schema.
--
-- IMPORTANT:
-- Populate plans.stripe_price_id with the recurring Stripe Price IDs
-- from your Stripe account before enabling paid checkout.

ALTER TABLE plans ADD COLUMN stripe_price_id TEXT;

CREATE INDEX IF NOT EXISTS idx_plans_stripe_price_id
  ON plans(stripe_price_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_status
  ON stripe_events(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_external_customer_id
  ON subscriptions(external_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_external_subscription_id
  ON subscriptions(external_subscription_id);

-- Example after creating the Prices in Stripe:
-- UPDATE plans SET stripe_price_id = 'price_xxx' WHERE id = 'plan_developer';
-- UPDATE plans SET stripe_price_id = 'price_yyy' WHERE id = 'plan_pro';
-- UPDATE plans SET stripe_price_id = 'price_zzz' WHERE id = 'plan_business';

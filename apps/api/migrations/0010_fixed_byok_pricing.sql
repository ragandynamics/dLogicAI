ALTER TABLE plans ADD COLUMN byok_monthly_price_cents INTEGER;
ALTER TABLE plans ADD COLUMN byok_stripe_price_id TEXT;

UPDATE plans SET byok_monthly_price_cents = CASE id
  WHEN 'plan_developer' THEN 900
  WHEN 'plan_pro' THEN 2400
  WHEN 'plan_business' THEN 9900
  ELSE NULL
END;

CREATE INDEX IF NOT EXISTS idx_plans_byok_stripe_price_id
  ON plans(byok_stripe_price_id);

-- Managed AI customer charges are provider cost plus a plan-configured markup.
ALTER TABLE plans ADD COLUMN managed_ai_markup_bps INTEGER NOT NULL DEFAULT 3500;

UPDATE plans
SET included_ai_credit_micros = 2000000,
    managed_ai_markup_bps = 3500
WHERE id = 'plan_free';

UPDATE plans
SET included_ai_credit_micros = 15000000,
    managed_ai_markup_bps = 3500
WHERE id = 'plan_developer';

UPDATE plans
SET included_ai_credit_micros = 50000000,
    managed_ai_markup_bps = 3500
WHERE id = 'plan_pro';

UPDATE plans
SET included_ai_credit_micros = 200000000,
    managed_ai_markup_bps = 3500
WHERE id = 'plan_business';
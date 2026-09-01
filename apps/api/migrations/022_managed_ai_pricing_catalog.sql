-- Managed AI allowances are stored in USD micros: 1 USD = 1,000,000 micros.
-- Requests remain a technical quota, not a second billable allowance.
UPDATE plans
SET
  name = 'Free',
  monthly_price_cents = 0,
  included_requests = 1000,
  included_ai_credit_micros = 5000000,
  max_projects = 1,
  max_api_keys = 2,
  max_team_members = 1,
  byok_enabled = 0,
  max_byok_credentials = 0,
  features_json = '{"analytics":"basic","webhooks":false,"routing":false,"channels":false,"connectors":false}'
WHERE id = 'plan_free';

UPDATE plans
SET
  name = 'Builder',
  monthly_price_cents = 2900,
  included_requests = 25000,
  included_ai_credit_micros = 25000000,
  max_projects = 3,
  max_api_keys = 10,
  max_team_members = 3,
  byok_enabled = 1,
  max_byok_credentials = 2,
  byok_monthly_price_cents = 1900,
  features_json = '{"analytics":"standard","webhooks":true,"routing":true,"channels":false,"connectors":false}'
WHERE id = 'plan_developer';

UPDATE plans
SET
  name = 'Growth',
  monthly_price_cents = 9900,
  included_requests = 100000,
  included_ai_credit_micros = 100000000,
  max_projects = 10,
  max_api_keys = 50,
  max_team_members = 10,
  byok_enabled = 1,
  max_byok_credentials = 5,
  byok_monthly_price_cents = 5900,
  features_json = '{"analytics":"advanced","webhooks":true,"routing":true,"channels":true,"connectors":true}'
WHERE id = 'plan_pro';

UPDATE plans
SET
  name = 'Business',
  monthly_price_cents = 39900,
  included_requests = 500000,
  included_ai_credit_micros = 500000000,
  max_projects = 50,
  max_api_keys = 200,
  max_team_members = 30,
  byok_enabled = 1,
  max_byok_credentials = 100,
  byok_monthly_price_cents = 19900,
  features_json = '{"analytics":"advanced","webhooks":true,"routing":true,"channels":true,"connectors":true,"audit":true,"sso":true}'
WHERE id = 'plan_business';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS billing_plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  effective_at INTEGER NOT NULL,
  retired_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(plan_id, version)
);
CREATE INDEX IF NOT EXISTS idx_billing_plan_versions_plan ON billing_plan_versions(plan_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS billing_catalog_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL CHECK(item_type IN ('addon','meter','connector')),
  meter_key TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  unit_price_micros INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_catalog_active ON billing_catalog_items(active, item_type);

CREATE TABLE IF NOT EXISTS billing_plan_entitlements (
  id TEXT PRIMARY KEY,
  plan_version_id TEXT NOT NULL,
  meter_key TEXT NOT NULL,
  included_units INTEGER NOT NULL DEFAULT 0,
  overage_unit_price_micros INTEGER NOT NULL DEFAULT 0,
  overage_enabled INTEGER NOT NULL DEFAULT 0,
  hard_limit INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(plan_version_id, meter_key),
  FOREIGN KEY(plan_version_id) REFERENCES billing_plan_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_plan_entitlements_meter ON billing_plan_entitlements(meter_key);

CREATE TABLE IF NOT EXISTS tenant_addons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  stripe_subscription_item_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(catalog_item_id) REFERENCES billing_catalog_items(id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_addons_tenant ON tenant_addons(tenant_id, status);

CREATE TABLE IF NOT EXISTS billing_usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  meter_key TEXT NOT NULL,
  connector_id TEXT,
  quantity INTEGER NOT NULL,
  billable_units INTEGER NOT NULL DEFAULT 0,
  unit_price_micros INTEGER NOT NULL DEFAULT 0,
  charge_micros INTEGER NOT NULL DEFAULT 0,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  reference_id TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at INTEGER NOT NULL,
  UNIQUE(tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_billing_usage_period ON billing_usage_events(tenant_id, meter_key, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_billing_usage_connector ON billing_usage_events(tenant_id, connector_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  subtotal_micros INTEGER NOT NULL DEFAULT 0,
  total_micros INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  stripe_invoice_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS billing_invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_micros INTEGER NOT NULL DEFAULT 0,
  amount_micros INTEGER NOT NULL DEFAULT 0,
  source_meter_key TEXT,
  source_reference_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice ON billing_invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type, received_at DESC);

CREATE TABLE IF NOT EXISTS connector_catalog (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_connector_entitlements (
  id TEXT PRIMARY KEY,
  plan_version_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  included_api_calls INTEGER NOT NULL DEFAULT 0,
  overage_unit_price_micros INTEGER NOT NULL DEFAULT 0,
  overage_enabled INTEGER NOT NULL DEFAULT 1,
  hard_limit INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(plan_version_id, connector_id),
  FOREIGN KEY(plan_version_id) REFERENCES billing_plan_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(connector_id) REFERENCES connector_catalog(id)
);
CREATE INDEX IF NOT EXISTS idx_connector_entitlements_plan ON billing_connector_entitlements(plan_version_id);

INSERT OR IGNORE INTO connector_catalog (id, key, name, description, active, created_at, updated_at)
VALUES
  ('conn_amazon', 'amazon', 'Amazon SP-API', 'Orders, products, inventory, shipments, returns, and refunds.', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('conn_shopee', 'shopee', 'Shopee', 'Shop orders, products, inventory, shipping, and fulfillment.', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('conn_lazada', 'lazada', 'Lazada', 'Marketplace orders, products, inventory, and shipment status.', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('conn_tiktok_shop', 'tiktok_shop', 'TikTok Shop', 'Shop orders, product catalog, fulfillment, and seller data.', 1, unixepoch() * 1000, unixepoch() * 1000);

CREATE TABLE IF NOT EXISTS connector_installations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  name TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'configured',
  last_tested_at INTEGER,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, connector_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (connector_id) REFERENCES connector_catalog(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS connector_installations_scope_idx
  ON connector_installations(tenant_id, project_id, environment, status);

CREATE TABLE IF NOT EXISTS connector_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (installation_id) REFERENCES connector_installations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS connector_events_scope_idx
  ON connector_events(tenant_id, project_id, created_at DESC);

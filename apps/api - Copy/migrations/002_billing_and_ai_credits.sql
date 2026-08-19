-- dLogicAI billing and AI credit system
--
-- IMPORTANT:
-- The plans table already exists and is managed by the existing
-- dLogicAI schema. Do NOT recreate or modify it here.
--
-- Existing plans contain:
--   included_requests
--   included_ai_credit_micros
--   max_projects
--   max_api_keys
--   max_team_members
--   byok_request_fee_micros
--   features_json


-- ============================================================
-- Tenant subscription
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'active',

  current_period_start INTEGER NOT NULL,
  current_period_end INTEGER NOT NULL,

  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,

  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant
  ON subscriptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status
  ON subscriptions(tenant_id, status);


-- ============================================================
-- One AI-credit account per tenant
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,

  -- Credits included with the subscription.
  subscription_balance INTEGER NOT NULL DEFAULT 0,

  -- Credits purchased manually.
  purchased_balance INTEGER NOT NULL DEFAULT 0,

  -- Promotional / bonus credits.
  promotional_balance INTEGER NOT NULL DEFAULT 0,

  -- Lifetime credits consumed.
  total_consumed INTEGER NOT NULL DEFAULT 0,

  -- Optional automatic top-up.
  auto_topup_enabled INTEGER NOT NULL DEFAULT 0,
  auto_topup_threshold INTEGER NOT NULL DEFAULT 0,
  auto_topup_credits INTEGER NOT NULL DEFAULT 0,
  auto_topup_limit INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_accounts_tenant
  ON credit_accounts(tenant_id);


-- ============================================================
-- Immutable AI-credit ledger
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,

  tenant_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,

  -- Examples:
  -- subscription_grant
  -- purchase
  -- promotional_grant
  -- reservation
  -- consumption
  -- refund
  -- expiration
  entry_type TEXT NOT NULL,

  -- Examples:
  -- subscription
  -- manual_purchase
  -- promotion
  -- ai_request
  -- system
  source TEXT NOT NULL,

  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,

  reference_type TEXT,
  reference_id TEXT,

  description TEXT,

  expires_at INTEGER,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant
  ON credit_ledger(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_reference
  ON credit_ledger(reference_type, reference_id);


-- ============================================================
-- AI-credit reservations
--
-- Credits are reserved before calling OpenAI/Gemini.
-- This prevents concurrent requests from overspending.
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_reservations (
  id TEXT PRIMARY KEY,

  tenant_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,

  request_id TEXT NOT NULL UNIQUE,
  project_id TEXT,

  reserved_credits INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'reserved',

  -- Actual credits consumed after provider response.
  actual_credits INTEGER,

  created_at INTEGER NOT NULL,
  settled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_tenant
  ON credit_reservations(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_request
  ON credit_reservations(request_id);


-- ============================================================
-- Manual AI-credit purchases / automatic top-ups
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_purchases (
  id TEXT PRIMARY KEY,

  tenant_id TEXT NOT NULL,

  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,

  -- manual / auto_topup
  purchase_type TEXT NOT NULL DEFAULT 'manual',

  payment_provider TEXT,
  payment_reference TEXT,

  -- pending / completed / failed / refunded
  status TEXT NOT NULL DEFAULT 'pending',

  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_tenant
  ON credit_purchases(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_payment
  ON credit_purchases(payment_provider, payment_reference);
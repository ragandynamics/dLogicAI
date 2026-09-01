ALTER TABLE login_challenges ADD COLUMN tenant_id TEXT;

CREATE INDEX IF NOT EXISTS login_challenge_tenant_idx
  ON login_challenges(tenant_id);

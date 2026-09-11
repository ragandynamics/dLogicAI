-- Atomic AI-credit reservations retain the source balances so any failed
-- provider operation can be refunded to the original credit bucket.
ALTER TABLE credit_reservations ADD COLUMN promotional_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_reservations ADD COLUMN subscription_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_reservations ADD COLUMN purchased_credits INTEGER NOT NULL DEFAULT 0;

-- Guard the account invariant even if a future write bypasses the reservation
-- service. SQLite/D1 aborts the entire statement on a violated trigger.
CREATE TRIGGER IF NOT EXISTS credit_accounts_non_negative_insert
BEFORE INSERT ON credit_accounts
WHEN NEW.subscription_balance < 0
  OR NEW.purchased_balance < 0
  OR NEW.promotional_balance < 0
BEGIN
  SELECT RAISE(ABORT, 'credit account balance cannot be negative');
END;

CREATE TRIGGER IF NOT EXISTS credit_accounts_non_negative_update
BEFORE UPDATE OF subscription_balance, purchased_balance, promotional_balance ON credit_accounts
WHEN NEW.subscription_balance < 0
  OR NEW.purchased_balance < 0
  OR NEW.promotional_balance < 0
BEGIN
  SELECT RAISE(ABORT, 'credit account balance cannot be negative');
END;


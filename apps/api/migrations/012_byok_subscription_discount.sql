ALTER TABLE plans ADD COLUMN byok_discount_percent INTEGER NOT NULL DEFAULT 0;

UPDATE plans
SET byok_discount_percent = CASE
  WHEN byok_enabled = 1 THEN 50
  ELSE 0
END;
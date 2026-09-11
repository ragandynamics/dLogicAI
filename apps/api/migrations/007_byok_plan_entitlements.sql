ALTER TABLE plans ADD COLUMN byok_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN max_byok_credentials INTEGER NOT NULL DEFAULT 0;

UPDATE plans
SET byok_enabled = CASE name
  WHEN 'Free' THEN 0
  ELSE 1
END,
max_byok_credentials = CASE name
  WHEN 'Free' THEN 0
  WHEN 'Developer' THEN 2
  WHEN 'Pro' THEN 5
  WHEN 'Business' THEN 100
  ELSE 0
END;
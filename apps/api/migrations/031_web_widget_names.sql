ALTER TABLE web_widgets ADD COLUMN name TEXT;
UPDATE web_widgets
SET name = COALESCE(NULLIF(json_extract(config_json, '$.title'), ''), 'Website widget')
WHERE name IS NULL;

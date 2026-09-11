UPDATE chat_services
SET model = 'gemini-3.5-flash-lite', updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE model = 'gemini-2.5-flash-lite';

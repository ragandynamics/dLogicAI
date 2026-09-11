ALTER TABLE chat_services ADD COLUMN encrypted_llm_key TEXT;

-- Preserve an explicitly selected legacy project credential during the UI migration.
UPDATE chat_services
SET encrypted_llm_key = (
  SELECT pc.encrypted_credentials
  FROM provider_credentials pc
  WHERE pc.id = chat_services.provider_credential_id
    AND pc.tenant_id = chat_services.tenant_id
    AND pc.project_id = chat_services.project_id
    AND pc.provider = 'google'
    AND pc.status = 'active'
)
WHERE provider_mode = 'tenant'
  AND provider_credential_id IS NOT NULL;

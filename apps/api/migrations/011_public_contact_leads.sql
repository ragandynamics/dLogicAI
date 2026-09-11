CREATE TABLE IF NOT EXISTS public_contact_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS public_contact_leads_created_idx
  ON public_contact_leads(created_at DESC);
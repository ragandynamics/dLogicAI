ALTER TABLE public_contact_leads ADD COLUMN company_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public_contact_leads ADD COLUMN country_code TEXT NOT NULL DEFAULT '';
ALTER TABLE public_contact_leads ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE public_contact_leads ADD COLUMN enquiry_type TEXT NOT NULL DEFAULT 'other';
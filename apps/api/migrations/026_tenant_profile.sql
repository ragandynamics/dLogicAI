ALTER TABLE tenants ADD COLUMN company_name TEXT;
ALTER TABLE tenants ADD COLUMN country TEXT;
ALTER TABLE tenants ADD COLUMN organization_type TEXT NOT NULL DEFAULT 'individual';


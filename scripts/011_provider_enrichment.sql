-- ============================================================
-- OpenBenefacts — Migration 011: Provider enrichment columns
-- Adds CRO data, directors, registered address, company status
-- Source: OpenCorporates API + CRO
-- ============================================================

ALTER TABLE emergency_providers
  ADD COLUMN IF NOT EXISTS registered_address  TEXT,
  ADD COLUMN IF NOT EXISTS company_status      TEXT,          -- 'Active', 'Dissolved', 'Strike Off', etc.
  ADD COLUMN IF NOT EXISTS incorporation_date  DATE,
  ADD COLUMN IF NOT EXISTS company_type        TEXT,          -- 'Private Limited Company', 'CLG', 'DAC', etc.
  ADD COLUMN IF NOT EXISTS directors           JSONB DEFAULT '[]'::jsonb,  -- [{name, role, appointed_date}]
  ADD COLUMN IF NOT EXISTS opencorporates_url  TEXT,
  ADD COLUMN IF NOT EXISTS charity_number      TEXT,          -- CHY number if applicable
  ADD COLUMN IF NOT EXISTS enriched_at         TIMESTAMPTZ;   -- last time we ran enrichment

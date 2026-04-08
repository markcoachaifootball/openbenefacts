-- OpenBenefacts Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Fuzzy text matching
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation

-- ============================================================
-- ORGANISATIONS
-- ============================================================
CREATE TABLE organisations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL,
  name_normalised text NOT NULL,
  also_known_as   text[] DEFAULT '{}',
  charity_number  text,          -- RCN from Charities Regulator
  cro_number      text,          -- Companies Registration Office
  revenue_chy     text,          -- Revenue Commissioners CHY number
  sector          text,
  subsector       text,
  county          text,
  address         text DEFAULT '',
  eircode         text DEFAULT '',
  governing_form  text DEFAULT '',
  date_incorporated date,
  status          text DEFAULT 'active',
  benefacts_id    text DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Indexes for search and matching
CREATE INDEX idx_orgs_name_trgm ON organisations USING gin (name_normalised gin_trgm_ops);
CREATE INDEX idx_orgs_charity_number ON organisations (charity_number) WHERE charity_number IS NOT NULL AND charity_number != '';
CREATE INDEX idx_orgs_cro_number ON organisations (cro_number) WHERE cro_number IS NOT NULL AND cro_number != '';
CREATE INDEX idx_orgs_revenue_chy ON organisations (revenue_chy) WHERE revenue_chy IS NOT NULL AND revenue_chy != '';
CREATE INDEX idx_orgs_sector ON organisations (sector);
CREATE INDEX idx_orgs_county ON organisations (county);
CREATE INDEX idx_orgs_name_normalised ON organisations (name_normalised);

-- Full-text search
ALTER TABLE organisations ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(county, '') || ' ' || coalesce(sector, ''))
  ) STORED;
CREATE INDEX idx_orgs_fts ON organisations USING gin (fts);

-- ============================================================
-- FINANCIALS (one row per org per year)
-- ============================================================
CREATE TABLE financials (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  year              integer NOT NULL,
  gross_income      numeric DEFAULT 0,
  gross_expenditure numeric DEFAULT 0,
  government_income numeric DEFAULT 0,
  public_income     numeric DEFAULT 0,
  donations_income  numeric DEFAULT 0,
  trading_income    numeric DEFAULT 0,
  other_income      numeric DEFAULT 0,
  surplus           numeric DEFAULT 0,
  employees         integer DEFAULT 0,
  volunteers        integer DEFAULT 0,
  total_assets      numeric DEFAULT 0,
  total_liabilities numeric DEFAULT 0,
  net_assets        numeric DEFAULT 0,
  state_funding_pct numeric DEFAULT 0,
  source            text DEFAULT '',
  source_url        text DEFAULT '',
  created_at        timestamptz DEFAULT now(),
  UNIQUE(org_id, year)
);

CREATE INDEX idx_financials_org ON financials (org_id);
CREATE INDEX idx_financials_year ON financials (year);
CREATE INDEX idx_financials_income ON financials (gross_income) WHERE gross_income > 0;

-- ============================================================
-- FUNDERS
-- ============================================================
CREATE TABLE funders (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL UNIQUE,
  type            text DEFAULT 'Government',
  website         text DEFAULT '',
  scraper_id      text,
  last_scraped    timestamptz,
  scrape_frequency text DEFAULT 'monthly',
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- FUNDING PROGRAMMES
-- ============================================================
CREATE TABLE funding_programmes (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  funder_id uuid NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  name      text NOT NULL,
  UNIQUE(funder_id, name)
);

CREATE INDEX idx_programmes_funder ON funding_programmes (funder_id);

-- ============================================================
-- FUNDING GRANTS (the core funder→recipient mapping)
-- ============================================================
CREATE TABLE funding_grants (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              uuid REFERENCES organisations(id) ON DELETE SET NULL,
  funder_id           uuid NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  programme_id        uuid REFERENCES funding_programmes(id) ON DELETE SET NULL,
  recipient_name_raw  text NOT NULL,
  amount              numeric DEFAULT 0,
  year                integer,
  match_confidence    numeric DEFAULT 0,
  match_method        text DEFAULT 'unmatched',
  reviewed            boolean DEFAULT false,
  source_url          text DEFAULT '',
  scraped_at          timestamptz DEFAULT now(),
  UNIQUE(funder_id, recipient_name_raw, year, amount)
);

CREATE INDEX idx_grants_org ON funding_grants (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_grants_funder ON funding_grants (funder_id);
CREATE INDEX idx_grants_year ON funding_grants (year);
CREATE INDEX idx_grants_unmatched ON funding_grants (match_confidence) WHERE org_id IS NULL;

-- ============================================================
-- ENTITY MATCHES (matching resolution audit trail)
-- ============================================================
CREATE TABLE entity_matches (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_name        text NOT NULL,
  matched_org_id  uuid REFERENCES organisations(id) ON DELETE SET NULL,
  confidence      numeric NOT NULL DEFAULT 0,
  method          text NOT NULL DEFAULT 'unmatched',
  reviewed_by     text,
  reviewed_at     timestamptz,
  source_funder   text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(raw_name, source_funder)
);

CREATE INDEX idx_matches_org ON entity_matches (matched_org_id);
CREATE INDEX idx_matches_confidence ON entity_matches (confidence);
CREATE INDEX idx_matches_unreviewed ON entity_matches (reviewed_by) WHERE reviewed_by IS NULL;

-- ============================================================
-- SCRAPER RUNS (monitoring / audit log)
-- ============================================================
CREATE TABLE scraper_runs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scraper_id      text NOT NULL,
  started_at      timestamptz DEFAULT now(),
  finished_at     timestamptz,
  status          text DEFAULT 'running',  -- running, success, partial, failed
  records_found   integer DEFAULT 0,
  records_new     integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  error_message   text,
  metadata        jsonb DEFAULT '{}'
);

CREATE INDEX idx_scraper_runs_id ON scraper_runs (scraper_id, started_at DESC);

-- ============================================================
-- VIEWS (for the frontend)
-- ============================================================

-- Funder summary view (replaces the FUNDERS array in data.js)
CREATE OR REPLACE VIEW funder_summary AS
SELECT
  f.id,
  f.name,
  f.type,
  f.website,
  f.last_scraped,
  f.scrape_frequency,
  COALESCE(SUM(g.amount), 0) AS total_funding,
  COUNT(DISTINCT g.org_id) FILTER (WHERE g.org_id IS NOT NULL) AS matched_recipients,
  COUNT(DISTINCT g.recipient_name_raw) AS total_recipients,
  COUNT(DISTINCT g.programme_id) AS programme_count,
  ARRAY_AGG(DISTINCT fp.name) FILTER (WHERE fp.name IS NOT NULL) AS programmes
FROM funders f
LEFT JOIN funding_grants g ON g.funder_id = f.id
LEFT JOIN funding_programmes fp ON fp.funder_id = f.id
GROUP BY f.id;

-- Organisation summary view (replaces allOrgs in data.js)
CREATE OR REPLACE VIEW org_summary AS
SELECT
  o.id,
  o.name,
  o.sector,
  o.subsector,
  o.county,
  o.governing_form,
  o.charity_number,
  o.cro_number,
  o.status,
  -- Latest financials
  fin.gross_income,
  fin.gross_expenditure,
  fin.state_funding_pct,
  fin.employees,
  fin.volunteers,
  fin.total_assets,
  fin.year AS financial_year,
  -- Funding summary
  COALESCE(gs.total_grants, 0) AS total_grants,
  COALESCE(gs.total_grant_amount, 0) AS total_grant_amount,
  COALESCE(gs.funder_count, 0) AS funder_count
FROM organisations o
LEFT JOIN LATERAL (
  SELECT * FROM financials
  WHERE org_id = o.id AND gross_income > 0
  ORDER BY year DESC LIMIT 1
) fin ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_grants,
    COALESCE(SUM(amount), 0) AS total_grant_amount,
    COUNT(DISTINCT funder_id) AS funder_count
  FROM funding_grants
  WHERE org_id = o.id
) gs ON true;

-- Platform stats view (replaces DATA.stats)
CREATE OR REPLACE VIEW platform_stats AS
SELECT
  (SELECT COUNT(*) FROM organisations) AS total_orgs,
  (SELECT COUNT(DISTINCT org_id) FROM financials WHERE gross_income > 0) AS with_financials,
  (SELECT COUNT(*) FROM funding_grants) AS total_funding_relationships,
  (SELECT COUNT(DISTINCT org_id) FROM funding_grants WHERE org_id IS NOT NULL) AS unique_funded,
  (SELECT COUNT(*) FROM funders) AS total_funders;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE funders ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- Public read access for organisations and funders (basic info)
CREATE POLICY "Public can view organisations" ON organisations FOR SELECT USING (true);
CREATE POLICY "Public can view funders" ON funders FOR SELECT USING (true);
CREATE POLICY "Public can view programmes" ON funding_programmes FOR SELECT USING (true);
CREATE POLICY "Public can view grants" ON funding_grants FOR SELECT USING (true);
CREATE POLICY "Public can view financials" ON financials FOR SELECT USING (true);

-- Only authenticated service role can write
CREATE POLICY "Service can insert orgs" ON organisations FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update orgs" ON organisations FOR UPDATE USING (true);
CREATE POLICY "Service can insert financials" ON financials FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert grants" ON funding_grants FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update grants" ON funding_grants FOR UPDATE USING (true);
CREATE POLICY "Service can manage funders" ON funders FOR ALL USING (true);
CREATE POLICY "Service can manage programmes" ON funding_programmes FOR ALL USING (true);
CREATE POLICY "Service can manage matches" ON entity_matches FOR ALL USING (true);
CREATE POLICY "Service can manage runs" ON scraper_runs FOR ALL USING (true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Name normalisation function (matches Python normalize_name)
CREATE OR REPLACE FUNCTION normalise_org_name(raw_name text)
RETURNS text AS $$
BEGIN
  RETURN trim(regexp_replace(
    regexp_replace(
      lower(trim(raw_name)),
      '\s+(clg|limited|ltd|unlimited company|company limited by guarantee|t/a\s+.*)$', '', 'i'
    ),
    '\s+', ' ', 'g'
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Match an org name against the database (returns best match with confidence)
CREATE OR REPLACE FUNCTION match_organisation(raw_name text)
RETURNS TABLE(org_id uuid, confidence numeric, method text) AS $$
DECLARE
  norm text;
  best_sim numeric;
BEGIN
  norm := normalise_org_name(raw_name);

  -- Level 1: Exact normalised name match
  RETURN QUERY
  SELECT o.id, 0.95::numeric, 'exact_name'::text
  FROM organisations o
  WHERE o.name_normalised = norm
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Level 2: Fuzzy match using trigram similarity
  RETURN QUERY
  SELECT o.id, similarity(o.name_normalised, norm)::numeric, 'fuzzy'::text
  FROM organisations o
  WHERE o.name_normalised % norm
    AND similarity(o.name_normalised, norm) >= 0.6
  ORDER BY similarity(o.name_normalised, norm) DESC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- No match found
  RETURN QUERY SELECT NULL::uuid, 0::numeric, 'unmatched'::text;
END;
$$ LANGUAGE plpgsql STABLE;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orgs_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

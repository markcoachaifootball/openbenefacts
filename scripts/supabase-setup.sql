-- ============================================================
-- OpenBenefacts — Supabase Database Setup
-- ============================================================
-- Run this in your Supabase SQL Editor (supabase.com → project → SQL Editor)
-- This creates the full schema needed for the platform.
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text search

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Organizations (the heart of the platform)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    charity_number TEXT,
    cro_number TEXT,
    revenue_number TEXT,
    sector TEXT,
    subsector TEXT,
    icnpo_code TEXT,
    county TEXT,
    address TEXT,
    eircode TEXT,
    status TEXT DEFAULT 'Active',
    year_established INTEGER,
    website TEXT,
    email TEXT,
    phone TEXT,
    description TEXT,
    charitable_purposes TEXT,
    activities TEXT,
    legal_type TEXT,  -- CLG, DAC, Trust, Unincorporated, etc.
    employees INTEGER DEFAULT 0,
    volunteers INTEGER DEFAULT 0,
    source TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial data (annual snapshots per organization)
CREATE TABLE IF NOT EXISTS financials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    -- Income
    total_income NUMERIC DEFAULT 0,
    government_funding NUMERIC DEFAULT 0,
    donations_fundraising NUMERIC DEFAULT 0,
    earned_income NUMERIC DEFAULT 0,
    investment_income NUMERIC DEFAULT 0,
    other_income NUMERIC DEFAULT 0,
    -- Expenditure
    total_expenditure NUMERIC DEFAULT 0,
    charitable_expenditure NUMERIC DEFAULT 0,
    fundraising_costs NUMERIC DEFAULT 0,
    governance_costs NUMERIC DEFAULT 0,
    support_costs NUMERIC DEFAULT 0,
    -- Balance sheet
    total_assets NUMERIC DEFAULT 0,
    current_assets NUMERIC DEFAULT 0,
    fixed_assets NUMERIC DEFAULT 0,
    total_liabilities NUMERIC DEFAULT 0,
    current_liabilities NUMERIC DEFAULT 0,
    long_term_liabilities NUMERIC DEFAULT 0,
    net_assets NUMERIC DEFAULT 0,
    -- Staff
    employee_count INTEGER,
    volunteer_count INTEGER,
    ceo_compensation NUMERIC,
    -- Metadata
    auditor TEXT,
    financial_year_end DATE,
    source TEXT,
    source_document_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, year)
);

-- AI Intelligence layer
CREATE TABLE IF NOT EXISTS ai_intelligence (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ai_summary TEXT,
    ai_one_liner TEXT,
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    transparency_rating INTEGER CHECK (transparency_rating BETWEEN 0 AND 100),
    state_funding_pct NUMERIC,
    governance_score INTEGER,
    financial_health_score INTEGER,
    key_insights JSONB DEFAULT '[]',
    model_used TEXT,
    model_version TEXT,
    sources JSONB DEFAULT '[]',
    enrichment_cost NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- State Funders
CREATE TABLE IF NOT EXISTS funders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT,
    funder_type TEXT,  -- 'Government Department', 'State Agency', 'Local Authority', 'EU/International'
    parent_department TEXT,
    total_annual_funding NUMERIC,
    recipient_count INTEGER,
    website TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funding Relationships (Benefacts "Who Funds What")
CREATE TABLE IF NOT EXISTS funding_relationships (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    funder_id UUID REFERENCES funders(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    amount NUMERIC,
    programme TEXT,
    scheme TEXT,
    purpose_code TEXT,
    funding_type TEXT,  -- 'Grant', 'Service Contract', 'Capital', 'Current'
    source TEXT,
    source_document_url TEXT,
    confidence_score NUMERIC DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funder Programme Spending (aggregate from annual reports)
CREATE TABLE IF NOT EXISTS funder_programmes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    funder_id UUID REFERENCES funders(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    programme_name TEXT NOT NULL,
    division TEXT,
    total_amount NUMERIC,
    recipient_count INTEGER,
    source_document_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funder yearly totals for trend charts
CREATE TABLE IF NOT EXISTS funder_yearly_totals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    funder_id UUID REFERENCES funders(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    total_funding NUMERIC,
    source TEXT,
    UNIQUE(funder_id, year)
);

-- Trustees / Board Members
CREATE TABLE IF NOT EXISTS trustees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,  -- 'Chair', 'Director', 'Secretary', 'Treasurer', 'Member'
    appointed_date DATE,
    resigned_date DATE,
    is_current BOOLEAN DEFAULT TRUE,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PLATFORM TABLES
-- ============================================================

-- User accounts (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'user',  -- 'user', 'admin', 'researcher'
    organization TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved searches / watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- ============================================================
-- AUDIT & DATA QUALITY
-- ============================================================

-- Audit trail for all data changes
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id UUID,
    action TEXT NOT NULL,  -- 'INSERT', 'UPDATE', 'DELETE'
    old_data JSONB,
    new_data JSONB,
    source TEXT,
    pipeline_run_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data pipeline runs
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pipeline_name TEXT NOT NULL,
    status TEXT DEFAULT 'running',  -- 'running', 'completed', 'failed'
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Job queue for async processing
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_type TEXT NOT NULL,  -- 'perplexity_enrich', 'gpt_analysis', 'data_import'
    organization_id UUID REFERENCES organizations(id),
    status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    priority INTEGER DEFAULT 5,
    payload JSONB,
    result JSONB,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orgs_charity_number ON organizations(charity_number);
CREATE INDEX IF NOT EXISTS idx_orgs_cro_number ON organizations(cro_number);
CREATE INDEX IF NOT EXISTS idx_orgs_sector ON organizations(sector);
CREATE INDEX IF NOT EXISTS idx_orgs_county ON organizations(county);
CREATE INDEX IF NOT EXISTS idx_orgs_name_trgm ON organizations USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orgs_status ON organizations(status);

CREATE INDEX IF NOT EXISTS idx_financials_org_year ON financials(organization_id, year);
CREATE INDEX IF NOT EXISTS idx_funding_rel_org ON funding_relationships(organization_id);
CREATE INDEX IF NOT EXISTS idx_funding_rel_funder ON funding_relationships(funder_id);
CREATE INDEX IF NOT EXISTS idx_funding_rel_year ON funding_relationships(year);
CREATE INDEX IF NOT EXISTS idx_trustees_org ON trustees(organization_id);
CREATE INDEX IF NOT EXISTS idx_trustees_current ON trustees(is_current) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_org ON ai_intelligence(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, created_at);

-- ============================================================
-- FULL-TEXT SEARCH (for the search bar)
-- ============================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION update_org_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.short_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.sector, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.county, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.charitable_purposes, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_search ON organizations;
CREATE TRIGGER trg_org_search
  BEFORE INSERT OR UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_org_search_vector();

CREATE INDEX IF NOT EXISTS idx_orgs_search ON organizations USING gin(search_vector);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Public read access, admin write
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON organizations FOR SELECT USING (true);
CREATE POLICY "Admin write" ON organizations FOR ALL USING (
  auth.jwt() ->> 'role' = 'admin'
);

ALTER TABLE financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON financials FOR SELECT USING (true);

ALTER TABLE funders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON funders FOR SELECT USING (true);

ALTER TABLE funding_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON funding_relationships FOR SELECT USING (true);

ALTER TABLE ai_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON ai_intelligence FOR SELECT USING (true);

ALTER TABLE trustees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON trustees FOR SELECT USING (true);

-- ============================================================
-- SEED: Major State Funders
-- ============================================================

INSERT INTO funders (name, abbreviation, funder_type, total_annual_funding, recipient_count, website, description) VALUES
('Department of Health', 'DOH', 'Government Department', 22800000000, 2800, 'gov.ie/health', 'Responsible for health policy and HSE funding, including Section 38/39 arrangements with voluntary hospitals and disability services'),
('Department of Housing, Local Government & Heritage', 'DHLGH', 'Government Department', 6200000000, 450, 'gov.ie/housing', 'Funds Approved Housing Bodies, homeless services, and local authority housing programmes'),
('Department of Children, Equality, Disability, Integration & Youth', 'DCEDIY', 'Government Department', 4100000000, 1200, 'gov.ie/dcediy', 'Funds Tusla (Child and Family Agency), National Childcare Scheme, youth services, and disability services'),
('Department of Education', 'DE', 'Government Department', 9500000000, 4200, 'gov.ie/education', 'Funds primary and post-primary schools, ETBs, higher education institutions, and DEIS programme'),
('Department of Social Protection', 'DSP', 'Government Department', 1200000000, 800, 'gov.ie/dsp', 'Administers Community Employment, Community Services Programme, and SICAP'),
('Pobal', 'Pobal', 'State Agency', 800000000, 3500, 'pobal.ie', 'Manages and administers government programmes including SICAP, community childcare, and Dormant Accounts Fund'),
('Health Service Executive', 'HSE', 'State Agency', 22400000000, 2500, 'hse.ie', 'Directly funds Section 38 and Section 39 organisations providing health and social care services'),
('Tusla - Child and Family Agency', 'Tusla', 'State Agency', 900000000, 600, 'tusla.ie', 'Funds family resource centres, domestic violence services, and child welfare organisations'),
('Sport Ireland', 'Sport Ireland', 'State Agency', 120000000, 400, 'sportireland.ie', 'Funds national governing bodies, local sports partnerships, and capital sports infrastructure'),
('Arts Council', 'Arts Council', 'State Agency', 130000000, 500, 'artscouncil.ie', 'Primary funder of arts organisations in Ireland including theatres, festivals, and arts centres')
ON CONFLICT DO NOTHING;

-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- Organization summary view (for listing pages)
CREATE OR REPLACE VIEW org_summary AS
SELECT
    o.id, o.name, o.short_name, o.charity_number, o.cro_number,
    o.sector, o.subsector, o.county, o.status, o.year_established, o.website,
    o.employees, o.volunteers, o.legal_type,
    f.total_income, f.total_expenditure, f.government_funding,
    f.donations_fundraising, f.total_assets, f.total_liabilities,
    f.year AS financial_year,
    ai.ai_summary, ai.ai_one_liner, ai.risk_score,
    ai.transparency_rating, ai.state_funding_pct
FROM organizations o
LEFT JOIN LATERAL (
    SELECT * FROM financials WHERE organization_id = o.id ORDER BY year DESC LIMIT 1
) f ON true
LEFT JOIN ai_intelligence ai ON ai.organization_id = o.id;

-- Funder summary view
CREATE OR REPLACE VIEW funder_summary AS
SELECT
    f.id, f.name, f.abbreviation, f.funder_type, f.total_annual_funding,
    f.recipient_count, f.website, f.description,
    COUNT(DISTINCT fr.organization_id) AS actual_recipients,
    SUM(fr.amount) AS total_disbursed
FROM funders f
LEFT JOIN funding_relationships fr ON fr.funder_id = f.id
GROUP BY f.id;

-- ============================================================
-- DONE!
-- ============================================================
-- Your database is ready. Next steps:
-- 1. Run the data pipeline: python scripts/data-pipeline.py
-- 2. Import data using the Supabase client in the app
-- 3. Run AI enrichment: python scripts/ai-enrichment.py

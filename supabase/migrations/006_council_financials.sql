-- OpenBenefacts: Irish Local Authority Financial Data
-- Extracted from Annual Financial Statements (AFS) PDFs
-- 31 councils, 2009-2025, ~300 council-year records

-- ── Councils reference table ──
CREATE TABLE IF NOT EXISTS councils (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    county TEXT,
    council_type TEXT CHECK (council_type IN ('county', 'city', 'city_and_county')),
    website TEXT,
    afs_page_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Income & Expenditure (one row per council per year) ──
CREATE TABLE IF NOT EXISTS council_income_expenditure (
    id SERIAL PRIMARY KEY,
    council_id INTEGER NOT NULL REFERENCES councils(id),
    year INTEGER NOT NULL,
    source_status TEXT CHECK (source_status IN ('OK', 'PARTIAL', 'FAIL')),
    is_ocr BOOLEAN DEFAULT FALSE,
    pdf_url TEXT,

    -- Top-level I&E figures (in euros, whole numbers)
    total_gross_expenditure BIGINT,
    total_income BIGINT,
    total_net_expenditure BIGINT,
    rates BIGINT,
    local_property_tax BIGINT,
    surplus_deficit_before_transfers BIGINT,
    transfers_from_to_reserves BIGINT,
    overall_surplus_deficit BIGINT,
    general_reserve_opening BIGINT,
    general_reserve_closing BIGINT,

    -- Prior year comparatives (from same AFS document)
    total_net_expenditure_prior BIGINT,
    rates_prior BIGINT,
    local_property_tax_prior BIGINT,
    surplus_deficit_before_transfers_prior BIGINT,
    transfers_from_to_reserves_prior BIGINT,
    overall_surplus_deficit_prior BIGINT,
    general_reserve_opening_prior BIGINT,
    general_reserve_closing_prior BIGINT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(council_id, year)
);

-- ── Balance Sheet (one row per council per year) ──
CREATE TABLE IF NOT EXISTS council_balance_sheet (
    id SERIAL PRIMARY KEY,
    council_id INTEGER NOT NULL REFERENCES councils(id),
    year INTEGER NOT NULL,

    fixed_assets_operational BIGINT,
    fixed_assets_infrastructural BIGINT,
    fixed_assets_community BIGINT,
    fixed_assets_non_operational BIGINT,
    fixed_assets_total BIGINT,
    work_in_progress BIGINT,
    long_term_debtors BIGINT,
    current_assets_total BIGINT,
    current_liabilities_total BIGINT,
    net_current_assets BIGINT,
    loans_payable BIGINT,
    creditors_long_term_total BIGINT,
    net_assets BIGINT,
    capitalisation_account BIGINT,
    general_revenue_reserve BIGINT,
    total_reserves BIGINT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(council_id, year)
);

-- ── Division-level expenditure (8 ACOP divisions per council per year) ──
CREATE TABLE IF NOT EXISTS council_division_expenditure (
    id SERIAL PRIMARY KEY,
    council_id INTEGER NOT NULL REFERENCES councils(id),
    year INTEGER NOT NULL,
    division_code CHAR(1) NOT NULL,
    division_name TEXT NOT NULL,
    gross_expenditure BIGINT,
    income BIGINT,
    net_expenditure BIGINT,
    net_expenditure_prior BIGINT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(council_id, year, division_code)
);

-- ── Indexes for common queries ──
CREATE INDEX idx_council_ie_year ON council_income_expenditure(year);
CREATE INDEX idx_council_ie_council ON council_income_expenditure(council_id);
CREATE INDEX idx_council_bs_year ON council_balance_sheet(year);
CREATE INDEX idx_council_bs_council ON council_balance_sheet(council_id);
CREATE INDEX idx_council_div_year ON council_division_expenditure(year);
CREATE INDEX idx_council_div_council ON council_division_expenditure(council_id);

-- ── Useful views ──
CREATE OR REPLACE VIEW council_financial_summary AS
SELECT
    c.name AS council_name,
    c.slug,
    c.council_type,
    ie.year,
    ie.source_status,
    ie.total_gross_expenditure,
    ie.total_income,
    ie.total_net_expenditure,
    ie.rates,
    ie.local_property_tax,
    ie.overall_surplus_deficit,
    ie.general_reserve_closing,
    bs.fixed_assets_total,
    bs.net_assets,
    bs.loans_payable,
    bs.total_reserves
FROM councils c
JOIN council_income_expenditure ie ON ie.council_id = c.id
LEFT JOIN council_balance_sheet bs ON bs.council_id = c.id AND bs.year = ie.year
ORDER BY c.name, ie.year;

-- ── Enable Row Level Security (public read) ──
ALTER TABLE councils ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_income_expenditure ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_balance_sheet ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_division_expenditure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON councils FOR SELECT USING (true);
CREATE POLICY "Public read access" ON council_income_expenditure FOR SELECT USING (true);
CREATE POLICY "Public read access" ON council_balance_sheet FOR SELECT USING (true);
CREATE POLICY "Public read access" ON council_division_expenditure FOR SELECT USING (true);

-- ── Seed the 31 councils ──
INSERT INTO councils (name, slug, council_type) VALUES
    ('Carlow County Council', 'carlow', 'county'),
    ('Cavan County Council', 'cavan', 'county'),
    ('Clare County Council', 'clare', 'county'),
    ('Cork City Council', 'cork_city', 'city'),
    ('Cork County Council', 'cork', 'county'),
    ('Donegal County Council', 'donegal', 'county'),
    ('Dublin City Council', 'dublin_city', 'city'),
    ('Dún Laoghaire-Rathdown County Council', 'dun_laoghaire_rathdown', 'county'),
    ('Fingal County Council', 'fingal', 'county'),
    ('Galway City Council', 'galway_city', 'city'),
    ('Galway County Council', 'galway', 'county'),
    ('Kerry County Council', 'kerry', 'county'),
    ('Kildare County Council', 'kildare', 'county'),
    ('Kilkenny County Council', 'kilkenny', 'county'),
    ('Laois County Council', 'laois', 'county'),
    ('Leitrim County Council', 'leitrim', 'county'),
    ('Limerick City and County Council', 'limerick', 'city_and_county'),
    ('Longford County Council', 'longford', 'county'),
    ('Louth County Council', 'louth', 'county'),
    ('Mayo County Council', 'mayo', 'county'),
    ('Meath County Council', 'meath', 'county'),
    ('Monaghan County Council', 'monaghan', 'county'),
    ('Offaly County Council', 'offaly', 'county'),
    ('Roscommon County Council', 'roscommon', 'county'),
    ('Sligo County Council', 'sligo', 'county'),
    ('South Dublin County Council', 'south_dublin', 'county'),
    ('Tipperary County Council', 'tipperary', 'county'),
    ('Waterford City and County Council', 'waterford', 'city_and_county'),
    ('Westmeath County Council', 'westmeath', 'county'),
    ('Wexford County Council', 'wexford', 'county'),
    ('Wicklow County Council', 'wicklow', 'county')
ON CONFLICT (slug) DO NOTHING;

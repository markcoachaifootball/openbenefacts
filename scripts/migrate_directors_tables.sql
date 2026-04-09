-- ============================================================
-- OpenBenefacts — Directors / Board Members Migration
-- ============================================================
-- Run this in Supabase SQL Editor BEFORE running import_directors.cjs
-- Creates the directors + org_directors tables used by the frontend
-- ============================================================

-- Directors (unique people who sit on boards)
CREATE TABLE IF NOT EXISTS directors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    name_normalised TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Org-Director links (which person sits on which board)
CREATE TABLE IF NOT EXISTS org_directors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    director_id UUID NOT NULL REFERENCES directors(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Trustee',
    start_date DATE,
    end_date DATE,
    source TEXT DEFAULT 'charities_register',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, director_id, role)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_directors_name_norm ON directors(name_normalised);
CREATE INDEX IF NOT EXISTS idx_org_directors_org ON org_directors(org_id);
CREATE INDEX IF NOT EXISTS idx_org_directors_director ON org_directors(director_id);

-- RLS: public read access
ALTER TABLE directors ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_directors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public read directors" ON directors;
    DROP POLICY IF EXISTS "Public read org_directors" ON org_directors;
    DROP POLICY IF EXISTS "Service write directors" ON directors;
    DROP POLICY IF EXISTS "Service write org_directors" ON org_directors;
END $$;

CREATE POLICY "Public read directors" ON directors FOR SELECT USING (true);
CREATE POLICY "Public read org_directors" ON org_directors FOR SELECT USING (true);

-- Allow service role to insert/update (needed for import script)
CREATE POLICY "Service write directors" ON directors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write org_directors" ON org_directors FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DONE! Now run: node scripts/import_directors.cjs
-- ============================================================

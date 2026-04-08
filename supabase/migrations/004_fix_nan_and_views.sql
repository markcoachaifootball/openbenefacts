-- ============================================================
-- 004: Fix 'nan' string values + rebuild views
-- The Python data migration wrote literal 'nan' strings instead
-- of SQL NULL. This cleans them up across all tables.
-- ============================================================

-- 1. Fix organisations table - replace 'nan' strings with NULL
UPDATE organisations SET county = NULL WHERE county = 'nan';
UPDATE organisations SET sector = NULL WHERE sector = 'nan';
UPDATE organisations SET subsector = NULL WHERE subsector = 'nan';
UPDATE organisations SET governing_form = NULL WHERE governing_form = 'nan';
UPDATE organisations SET address = NULL WHERE address = 'nan';
UPDATE organisations SET eircode = NULL WHERE eircode = 'nan';
UPDATE organisations SET charity_number = NULL WHERE charity_number = 'nan';
UPDATE organisations SET cro_number = NULL WHERE cro_number = 'nan';
UPDATE organisations SET revenue_chy = NULL WHERE revenue_chy = 'nan';
UPDATE organisations SET date_incorporated = NULL WHERE date_incorporated = 'nan';

-- Also clean empty strings
UPDATE organisations SET county = NULL WHERE county = '';
UPDATE organisations SET sector = NULL WHERE sector = '';
UPDATE organisations SET subsector = NULL WHERE subsector = '';
UPDATE organisations SET governing_form = NULL WHERE governing_form = '';

-- 2. Fix financials table
UPDATE financials SET source = NULL WHERE source = 'nan';

-- 3. Fix funders table
UPDATE funders SET website = NULL WHERE website = 'nan';
UPDATE funders SET description = NULL WHERE description = 'nan';

-- 4. Rebuild sector_counts view (simpler version without LATERAL for reliability)
DROP VIEW IF EXISTS sector_counts;
CREATE VIEW sector_counts AS
SELECT
  sector,
  COUNT(*) AS org_count
FROM organisations
WHERE sector IS NOT NULL
GROUP BY sector
ORDER BY org_count DESC;

-- 5. Rebuild county_counts view (simpler version)
DROP VIEW IF EXISTS county_counts;
CREATE VIEW county_counts AS
SELECT
  county,
  COUNT(*) AS org_count
FROM organisations
WHERE county IS NOT NULL
GROUP BY county
ORDER BY org_count DESC;

-- 6. Verify: check how many sectors exist after cleanup
-- SELECT sector, COUNT(*) FROM organisations WHERE sector IS NOT NULL GROUP BY sector ORDER BY count DESC;

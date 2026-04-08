-- Fix 'nan' strings in organisations table
UPDATE organisations SET county = NULL WHERE county = 'nan';
UPDATE organisations SET sector = NULL WHERE sector = 'nan';
UPDATE organisations SET subsector = NULL WHERE subsector = 'nan';
UPDATE organisations SET governing_form = NULL WHERE governing_form = 'nan';
UPDATE organisations SET address = NULL WHERE address = 'nan';
UPDATE organisations SET eircode = NULL WHERE eircode = 'nan';
UPDATE organisations SET charity_number = NULL WHERE charity_number = 'nan';
UPDATE organisations SET cro_number = NULL WHERE cro_number = 'nan';
UPDATE organisations SET revenue_chy = NULL WHERE revenue_chy = 'nan';

-- Clean empty strings too
UPDATE organisations SET county = NULL WHERE county = '';
UPDATE organisations SET sector = NULL WHERE sector = '';
UPDATE organisations SET governing_form = NULL WHERE governing_form = '';

-- Fix funders (only website column exists)
UPDATE funders SET website = NULL WHERE website = 'nan';

-- Rebuild views
DROP VIEW IF EXISTS sector_counts;
CREATE VIEW sector_counts AS
SELECT sector, COUNT(*) AS org_count
FROM organisations WHERE sector IS NOT NULL
GROUP BY sector ORDER BY org_count DESC;

DROP VIEW IF EXISTS county_counts;
CREATE VIEW county_counts AS
SELECT county, COUNT(*) AS org_count
FROM organisations WHERE county IS NOT NULL
GROUP BY county ORDER BY org_count DESC;

-- ============================================================
-- FIX: Update legacy funding totals for ALL 14 funders
-- The funder_summary view falls back to legacy totals when
-- SUM(g.amount) = 0. This ensures all funders have correct
-- legacy values as a safety net.
-- ============================================================

-- Update legacy values for ALL funders (from scraper output April 2026)
UPDATE funders SET total_funding_legacy = 37550000, recipient_count_legacy = 24 WHERE name = 'Pobal';
UPDATE funders SET total_funding_legacy = 3971000000, recipient_count_legacy = 34 WHERE name = 'HSE / Dept of Health';
UPDATE funders SET total_funding_legacy = 160100000, recipient_count_legacy = 20 WHERE name = 'Tusla';
UPDATE funders SET total_funding_legacy = 24500000, recipient_count_legacy = 30 WHERE name = 'Arts Council';
UPDATE funders SET total_funding_legacy = 26700000, recipient_count_legacy = 28 WHERE name = 'Sport Ireland';
UPDATE funders SET total_funding_legacy = 5346300000, recipient_count_legacy = 29 WHERE name = 'Dept of Education';
UPDATE funders SET total_funding_legacy = 1764700000, recipient_count_legacy = 18 WHERE name = 'Dept of Housing';
UPDATE funders SET total_funding_legacy = 2593500000, recipient_count_legacy = 20 WHERE name = 'Dept of Further & Higher Ed';
UPDATE funders SET total_funding_legacy = 1068800000, recipient_count_legacy = 15 WHERE name = 'DEASP / Social Protection';
UPDATE funders SET total_funding_legacy = 727200000, recipient_count_legacy = 20 WHERE name = 'Local Authorities (31)';
UPDATE funders SET total_funding_legacy = 511600000, recipient_count_legacy = 19 WHERE name = 'EU Funding Bodies';
UPDATE funders SET total_funding_legacy = 122000000, recipient_count_legacy = 18 WHERE name = 'Dept of Rural & Community Dev';
UPDATE funders SET total_funding_legacy = 270600000, recipient_count_legacy = 19 WHERE name = 'Dept of Justice';
UPDATE funders SET total_funding_legacy = 281400000, recipient_count_legacy = 16 WHERE name = 'Dept of Foreign Affairs';

-- Recreate the view to ensure it's up to date
CREATE OR REPLACE VIEW funder_summary AS
SELECT
  f.id,
  f.name,
  f.type,
  f.website,
  f.last_scraped,
  f.scrape_frequency,
  -- Use actual grants if they exist, otherwise fall back to legacy
  CASE
    WHEN COALESCE(SUM(g.amount), 0) > 0 THEN SUM(g.amount)
    ELSE COALESCE(f.total_funding_legacy, 0)
  END AS total_funding,
  -- Recipients: actual matched or legacy
  CASE
    WHEN COUNT(DISTINCT g.recipient_name_raw) > 0 THEN COUNT(DISTINCT g.recipient_name_raw)
    ELSE COALESCE(f.recipient_count_legacy, 0)
  END AS total_recipients,
  COUNT(DISTINCT g.org_id) FILTER (WHERE g.org_id IS NOT NULL) AS matched_recipients,
  -- Programme count from programmes table directly
  (SELECT COUNT(*) FROM funding_programmes fp2 WHERE fp2.funder_id = f.id) AS programme_count,
  -- Programme names from programmes table directly
  (SELECT ARRAY_AGG(DISTINCT fp2.name) FROM funding_programmes fp2 WHERE fp2.funder_id = f.id) AS programmes
FROM funders f
LEFT JOIN funding_grants g ON g.funder_id = f.id
GROUP BY f.id;

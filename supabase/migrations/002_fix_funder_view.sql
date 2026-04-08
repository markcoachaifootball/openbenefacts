-- ============================================================
-- FIX: Add legacy funding totals to funders table
-- The migration imported aggregate funder data (total funding,
-- recipient counts) but not individual grants. This adds those
-- aggregates directly so the view works without grants.
-- ============================================================

-- Add legacy aggregate columns
ALTER TABLE funders ADD COLUMN IF NOT EXISTS total_funding_legacy numeric DEFAULT 0;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS recipient_count_legacy integer DEFAULT 0;

-- Update with known values from the original data.js
-- (These are the 5 active funders with scraped data)
UPDATE funders SET total_funding_legacy = 233997253, recipient_count_legacy = 9667 WHERE name = 'Arts Council';
UPDATE funders SET total_funding_legacy = 14927414, recipient_count_legacy = 91 WHERE name = 'Sport Ireland';
UPDATE funders SET total_funding_legacy = 196000000, recipient_count_legacy = 675 WHERE name = 'Tusla';
UPDATE funders SET total_funding_legacy = 4200000000, recipient_count_legacy = 2400 WHERE name = 'HSE / Dept of Health';
UPDATE funders SET total_funding_legacy = 180000000, recipient_count_legacy = 4200 WHERE name = 'Pobal';

-- Recreate funder_summary view to use legacy data as fallback
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

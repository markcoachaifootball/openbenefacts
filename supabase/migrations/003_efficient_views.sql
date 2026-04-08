-- ============================================================
-- 003: Efficient aggregation views + fix platform_stats
-- Replaces client-side counting (downloading 26K rows) with
-- server-side GROUP BY views for sectors and counties.
-- Also fixes platform_stats to use legacy funder data.
-- ============================================================

-- 1. Sector counts view
CREATE OR REPLACE VIEW sector_counts AS
SELECT
  sector,
  COUNT(*) AS org_count,
  COALESCE(SUM(f.gross_income), 0) AS total_income,
  COALESCE(SUM(f.employees), 0) AS total_employees
FROM organisations o
LEFT JOIN LATERAL (
  SELECT gross_income, employees
  FROM financials
  WHERE org_id = o.id
  ORDER BY year DESC
  LIMIT 1
) f ON true
WHERE o.sector IS NOT NULL AND o.sector != ''
GROUP BY o.sector
ORDER BY org_count DESC;

-- 2. County counts view
CREATE OR REPLACE VIEW county_counts AS
SELECT
  county,
  COUNT(*) AS org_count,
  COALESCE(SUM(f.gross_income), 0) AS total_income
FROM organisations o
LEFT JOIN LATERAL (
  SELECT gross_income
  FROM financials
  WHERE org_id = o.id
  ORDER BY year DESC
  LIMIT 1
) f ON true
WHERE o.county IS NOT NULL AND o.county != ''
GROUP BY o.county
ORDER BY org_count DESC;

-- 3. Fix platform_stats to use legacy funder data
DROP VIEW IF EXISTS platform_stats;
CREATE VIEW platform_stats AS
SELECT
  (SELECT COUNT(*) FROM organisations) AS total_orgs,
  (SELECT COUNT(DISTINCT org_id) FROM financials) AS with_financials,
  -- Use actual grants if they exist, otherwise sum legacy recipient counts
  CASE
    WHEN (SELECT COUNT(*) FROM funding_grants) > 0 THEN (SELECT COUNT(*) FROM funding_grants)
    ELSE (SELECT COALESCE(SUM(recipient_count_legacy), 0) FROM funders WHERE recipient_count_legacy > 0)
  END AS total_funding_relationships,
  -- Unique funded orgs: actual or legacy
  CASE
    WHEN (SELECT COUNT(*) FROM funding_grants) > 0 THEN (SELECT COUNT(DISTINCT org_id) FROM funding_grants WHERE org_id IS NOT NULL)
    ELSE (SELECT COALESCE(SUM(recipient_count_legacy), 0) FROM funders WHERE recipient_count_legacy > 0)
  END AS unique_funded,
  (SELECT COUNT(*) FROM funders) AS total_funders;

-- 4. Grant RLS policies on the new views (views inherit from base tables,
--    but we need SELECT access for the anon role)
-- Views don't need separate RLS — they use the policies on the underlying tables.
-- Just make sure the underlying tables have SELECT for anon (already done in 001).

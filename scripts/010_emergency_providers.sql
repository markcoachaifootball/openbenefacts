-- ============================================================
-- OpenBenefacts — Emergency Accommodation Providers
-- Migration 010: emergency_providers + provider_contracts
-- ============================================================
-- Deep-dive layer: names the hotels, B&Bs, hostels, and
-- companies housing people in emergency accommodation, plus
-- the contract values they receive from the State.
--
-- Sources:
--   • eTenders.gov.ie contract award notices
--   • Oireachtas parliamentary question responses
--   • DHLGH / DRHE FOI disclosure logs
--   • Companies Registration Office (CRO) link-outs
-- ============================================================

-- ─── PROVIDERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_providers (
  id                SERIAL PRIMARY KEY,
  name              TEXT    NOT NULL,
  trading_name      TEXT,                -- if different from legal name
  provider_type     TEXT,                -- 'Hotel', 'B&B', 'Hostel', 'Apartments', 'Charity', 'Unknown'
  accommodation_type TEXT,               -- 'PEA', 'STA', 'TEA', 'Mixed'
  region            TEXT,
  local_authority   TEXT,
  address           TEXT,
  cro_number        TEXT,                -- link to existing organisations table
  website           TEXT,
  est_bed_capacity  INTEGER,
  first_seen_date   DATE,                -- earliest known contract/reference
  last_seen_date    DATE,                -- most recent known reference
  total_known_revenue_eur BIGINT DEFAULT 0,
  source_count      INTEGER DEFAULT 0,   -- how many public sources reference this provider
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (name, local_authority)
);

CREATE INDEX IF NOT EXISTS idx_ep_name    ON emergency_providers (name);
CREATE INDEX IF NOT EXISTS idx_ep_region  ON emergency_providers (region);
CREATE INDEX IF NOT EXISTS idx_ep_la      ON emergency_providers (local_authority);
CREATE INDEX IF NOT EXISTS idx_ep_cro     ON emergency_providers (cro_number);
CREATE INDEX IF NOT EXISTS idx_ep_revenue ON emergency_providers (total_known_revenue_eur DESC);

-- ─── CONTRACTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_contracts (
  id                SERIAL PRIMARY KEY,
  provider_id       INTEGER REFERENCES emergency_providers(id) ON DELETE CASCADE,
  provider_name_raw TEXT NOT NULL,        -- as it appeared in the source
  awarding_body     TEXT,                 -- e.g. "Dublin City Council", "DRHE"
  local_authority   TEXT,
  region            TEXT,
  contract_title    TEXT,
  value_eur         BIGINT,
  award_date        DATE,
  start_date        DATE,
  end_date          DATE,
  source_type       TEXT,                 -- 'etenders', 'oireachtas_pq', 'foi', 'media'
  source_url        TEXT,
  source_reference  TEXT,                 -- PQ number, tender ID, FOI ref, etc.
  description       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (source_type, source_reference)
);

CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_contracts (provider_id);
CREATE INDEX IF NOT EXISTS idx_pc_value    ON provider_contracts (value_eur DESC);
CREATE INDEX IF NOT EXISTS idx_pc_date     ON provider_contracts (award_date DESC);
CREATE INDEX IF NOT EXISTS idx_pc_la       ON provider_contracts (local_authority);

-- ─── RLS: public read ─────────────────────────────────────────
ALTER TABLE emergency_providers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_contracts   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read emergency_providers"  ON emergency_providers;
CREATE POLICY "public read emergency_providers"
  ON emergency_providers FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read provider_contracts" ON provider_contracts;
CREATE POLICY "public read provider_contracts"
  ON provider_contracts FOR SELECT USING (true);

-- ─── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_ep_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ep_updated_at ON emergency_providers;
CREATE TRIGGER trg_ep_updated_at
  BEFORE UPDATE ON emergency_providers
  FOR EACH ROW EXECUTE FUNCTION update_ep_updated_at();

-- ─── Helper view: provider leaderboard ───────────────────────
CREATE OR REPLACE VIEW v_provider_leaderboard AS
SELECT
  p.id,
  p.name,
  p.trading_name,
  p.provider_type,
  p.region,
  p.local_authority,
  p.cro_number,
  p.est_bed_capacity,
  p.total_known_revenue_eur,
  p.source_count,
  p.first_seen_date,
  p.last_seen_date,
  COALESCE(c.contract_count, 0) AS contract_count,
  COALESCE(c.max_contract_value, 0) AS largest_contract_eur
FROM emergency_providers p
LEFT JOIN (
  SELECT provider_id,
         COUNT(*) AS contract_count,
         MAX(value_eur) AS max_contract_value
  FROM provider_contracts
  GROUP BY provider_id
) c ON c.provider_id = p.id
ORDER BY p.total_known_revenue_eur DESC NULLS LAST;

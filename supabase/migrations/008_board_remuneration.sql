-- ============================================================
-- Add board member remuneration/salary fields to org_directors
-- Irish state body board fees are public under the One Person
-- One Salary (OPOS) policy and Charities Governance Code
-- ============================================================

-- Add remuneration columns
ALTER TABLE org_directors ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
ALTER TABLE org_directors ADD COLUMN IF NOT EXISTS annual_fee NUMERIC DEFAULT 0;
ALTER TABLE org_directors ADD COLUMN IF NOT EXISTS remuneration_note TEXT;

-- Index for quick "who gets paid" queries
CREATE INDEX IF NOT EXISTS idx_org_directors_paid ON org_directors(is_paid) WHERE is_paid = true;

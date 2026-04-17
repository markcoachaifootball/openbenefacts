#!/usr/bin/env node
/**
 * import_scep_govie.cjs
 * ============================================================
 * Downloads Sports Capital & Equipment Programme data directly
 * from gov.ie official CSVs and imports into OpenBenefacts.
 *
 * Sources:
 *   1. 2023 SCEP Applications CSV (all applications with amounts)
 *   2. All Registered Organisations XLS (every club registered on OSCAR)
 *
 * Also fixes orphaned grants from previous imports (null org_id).
 *
 * Run:  node scripts/import_scep_govie.cjs
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

require("dotenv").config();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ilkwspvhqedzjreysuxu.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_KEY) { console.error("Missing SUPABASE_SERVICE_KEY in .env"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "..", "data", "oscar");

// Direct gov.ie download URLs
const SCEP_2023_CSV = "https://assets.gov.ie/static/documents/sports-capital-and-equipment-programme-2023-applications.csv";
const REGISTERED_ORGS_XLS = "https://assets.gov.ie/static/documents/sports-capital-programme-all-registered-organisations-march-2021-csv-version.xls";

// ─── Normalise names ────────────────────────────────────────
function normalise(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(THE|LTD\.?|LIMITED|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s&']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Parse CSV ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length >= 2) {
      const row = {};
      headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || "").trim(); });
      rows.push(row);
    }
  }
  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { values.push(current); current = ""; continue; }
    current += ch;
  }
  values.push(current);
  return values;
}

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[€$\s]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

// ─── Load organisations ─────────────────────────────────────
async function loadOrganisations() {
  let all = [];
  let page = 0;
  const ps = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, charity_number, cro_number, sector, county")
      .range(page * ps, (page + 1) * ps - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    page++;
    if (data.length < ps) break;
  }
  return all;
}

function buildLookups(orgs) {
  const byNorm = {};
  const byName = {};
  orgs.forEach(o => {
    const n = normalise(o.name);
    if (n) byNorm[n] = o;
    if (o.name) byName[o.name.toUpperCase().trim()] = o;
  });
  return { byNorm, byName };
}

function findMatch(name, county, lookups) {
  if (!name) return null;
  const norm = normalise(name);
  const upper = name.toUpperCase().trim();

  // Exact name match
  if (lookups.byName[upper]) return lookups.byName[upper];
  // Normalised match
  if (lookups.byNorm[norm]) return lookups.byNorm[norm];

  // Try with common suffixes removed
  const stripped = norm
    .replace(/\b(GAA|CLG|CLUB|RFC|AFC|FC|HURLING|CAMOGIE|SOCCER|RUGBY|ATHLETIC|ATHLETICS|SWIMMING|TENNIS|GOLF|HOCKEY|BOXING|ROWING|CRICKET|BASKETBALL|HANDBALL|COMMUNITY|PARISH|DEVELOPMENT)\b/g, "")
    .replace(/\s+/g, " ").trim();
  if (stripped && stripped.length > 4 && lookups.byNorm[stripped]) return lookups.byNorm[stripped];

  // County-aware substring
  for (const [key, org] of Object.entries(lookups.byNorm)) {
    if (key.length < 6) continue;
    if (norm.includes(key) || key.includes(norm)) {
      if (Math.abs(key.length - norm.length) < 15) {
        if (county && org.county && org.county.toUpperCase().includes(county.toUpperCase())) return org;
        return org;
      }
    }
  }
  return null;
}

// ─── Get or create funder ───────────────────────────────────
async function ensureFunder(name, type = "Government Department") {
  const { data: existing } = await supabase
    .from("funders")
    .select("id, name")
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("funders")
    .insert({ name, type })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

// ─── Step 1: Download and parse the 2023 SCEP CSV ──────────
async function downloadSCEP2023() {
  console.log("\n📥 Step 1: Downloading 2023 SCEP Applications from gov.ie...");
  console.log("─".repeat(60));

  try {
    const resp = await fetch(SCEP_2023_CSV, { timeout: 30000 });
    if (!resp.ok) {
      console.log(`   ✗ HTTP ${resp.status} — ${resp.statusText}`);
      return [];
    }
    const text = await resp.text();
    console.log(`   ✓ Downloaded (${(text.length / 1024).toFixed(0)} KB)`);

    // Save locally
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "scep_2023_applications.csv"), text);
    console.log(`   ✓ Saved to data/oscar/scep_2023_applications.csv`);

    const rows = parseCSV(text);
    console.log(`   ✓ Parsed ${rows.length} rows`);

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      console.log(`   Headers: ${headers.join(", ")}`);

      // Map columns
      const nameCol = headers.find(h => /applicant|organisation|club|grantee|recipient|name/i.test(h)) || headers[0];
      const amountCol = headers.find(h => /amount|allocation|grant|approved|total|requested/i.test(h));
      const countyCol = headers.find(h => /county|location|area/i.test(h));
      const sportCol = headers.find(h => /sport|type|category/i.test(h));
      const statusCol = headers.find(h => /status|outcome|result|decision/i.test(h));
      console.log(`   Mapping: name="${nameCol}" amount="${amountCol}" county="${countyCol}" sport="${sportCol}" status="${statusCol}"`);

      const grants = [];
      for (const row of rows) {
        const name = row[nameCol];
        const amount = parseAmount(row[amountCol]);
        const county = row[countyCol] || "";
        const sport = row[sportCol] || "";

        if (name && amount > 0) {
          grants.push({
            name: name.trim(),
            amount,
            county: county.trim(),
            year: 2023,
            sport: sport.trim(),
            programme: "Sports Capital & Equipment Programme 2023",
          });
        }
      }
      console.log(`   ✓ Extracted ${grants.length} grants with amounts`);
      return grants;
    }
    return [];
  } catch (e) {
    console.log(`   ✗ Download failed: ${e.message}`);

    // Try local fallback
    const localFile = path.join(DATA_DIR, "scep_2023_applications.csv");
    if (fs.existsSync(localFile)) {
      console.log(`   → Using local copy: ${localFile}`);
      const text = fs.readFileSync(localFile, "utf8");
      const rows = parseCSV(text);
      const headers = Object.keys(rows[0] || {});
      const nameCol = headers.find(h => /applicant|organisation|club|grantee|recipient|name/i.test(h)) || headers[0];
      const amountCol = headers.find(h => /amount|allocation|grant|approved|total|requested/i.test(h));
      const countyCol = headers.find(h => /county|location/i.test(h));
      const grants = [];
      for (const row of rows) {
        const name = row[nameCol];
        const amount = parseAmount(row[amountCol]);
        if (name && amount > 0) {
          grants.push({ name: name.trim(), amount, county: (row[countyCol] || "").trim(), year: 2023, programme: "Sports Capital & Equipment Programme 2023" });
        }
      }
      console.log(`   → Parsed ${grants.length} grants from local file`);
      return grants;
    }

    return [];
  }
}

// ─── Step 2: Fix orphaned grants ────────────────────────────
async function fixOrphanedGrants(lookups) {
  console.log("\n🔧 Step 2: Fixing orphaned grants (null org_id)...");
  console.log("─".repeat(60));

  // Get all grants with no org link
  const { data: orphans, error } = await supabase
    .from("funding_grants")
    .select("id, recipient_name_raw, programme")
    .is("org_id", null);

  if (error) { console.log(`   ✗ Error: ${error.message}`); return; }
  if (!orphans || orphans.length === 0) { console.log("   ✓ No orphaned grants found"); return; }

  console.log(`   Found ${orphans.length} orphaned grants`);

  let linked = 0, created = 0, still_orphan = 0;

  for (const g of orphans) {
    const name = g.recipient_name_raw;
    if (!name) { still_orphan++; continue; }

    // Try to find existing org
    let org = findMatch(name, null, lookups);

    if (!org) {
      // Create new org
      try {
        const newOrg = {
          name: name.trim(),
          sector: "Sport & Recreation",
          source: "OSCAR Sports Capital Programme",
        };
        const { data: createdOrg, error: createErr } = await supabase
          .from("organisations")
          .insert(newOrg)
          .select("id, name")
          .single();
        if (createErr) {
          // Try case-insensitive search
          const { data: found } = await supabase
            .from("organisations")
            .select("id")
            .ilike("name", name.trim())
            .maybeSingle();
          if (found) {
            org = found;
            linked++;
          } else {
            still_orphan++;
            continue;
          }
        } else {
          org = createdOrg;
          created++;
          const n = normalise(name);
          if (n) lookups.byNorm[n] = { id: createdOrg.id, name: name };
          if (name) lookups.byName[name.toUpperCase().trim()] = { id: createdOrg.id, name: name };
        }
      } catch (e) {
        still_orphan++;
        continue;
      }
    } else {
      linked++;
    }

    if (org) {
      await supabase
        .from("funding_grants")
        .update({ org_id: org.id })
        .eq("id", g.id);
    }
  }

  console.log(`   ✓ Linked to existing orgs: ${linked}`);
  console.log(`   ✓ New orgs created: ${created}`);
  console.log(`   ✗ Still orphaned: ${still_orphan}`);
}

// ─── Step 3: Import new grants ──────────────────────────────
async function importGrants(grants, funderId, lookups) {
  console.log(`\n📥 Step 3: Importing ${grants.length} grants to Supabase...`);
  console.log("─".repeat(60));

  let matched = 0, created = 0, inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    if (i % 200 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${grants.length} (${inserted} inserted, ${matched} matched, ${created} created, ${skipped} skipped)`);
    }

    let org = findMatch(g.name, g.county, lookups);
    let orgId = org?.id || null;

    if (!orgId) {
      // Create new org
      try {
        const newOrg = {
          name: g.name.trim(),
          sector: g.sport ? `Sport — ${g.sport}` : "Sport & Recreation",
          county: g.county || null,
          source: "OSCAR Sports Capital Programme",
        };
        const { data: createdOrg, error: createErr } = await supabase
          .from("organisations")
          .insert(newOrg)
          .select("id, name")
          .single();
        if (createErr) {
          const { data: found } = await supabase
            .from("organisations")
            .select("id")
            .ilike("name", g.name.trim())
            .maybeSingle();
          if (found) { orgId = found.id; matched++; }
        } else {
          orgId = createdOrg.id;
          created++;
          const n = normalise(g.name);
          if (n) lookups.byNorm[n] = { id: orgId, name: g.name, county: g.county };
          lookups.byName[g.name.toUpperCase().trim()] = { id: orgId, name: g.name };
        }
      } catch (e) { /* continue */ }
    } else {
      matched++;
    }

    // Skip exact duplicates
    const { data: existing } = await supabase
      .from("funding_grants")
      .select("id")
      .eq("funder_id", funderId)
      .eq("recipient_name_raw", g.name)
      .eq("programme", g.programme)
      .eq("amount", g.amount)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    const { error } = await supabase.from("funding_grants").insert({
      funder_id: funderId,
      org_id: orgId,
      recipient_name_raw: g.name,
      programme: g.programme,
      amount: g.amount,
      year: g.year || null,
    });

    if (error) {
      errors++;
      if (errors <= 5) console.log(`   ✗ ${g.name}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { matched, created, inserted, skipped, errors };
}

// ─── Step 4: Recalculate org grant totals ───────────────────
async function recalcGrantTotals() {
  console.log("\n📊 Step 4: Recalculating org grant totals...");
  console.log("─".repeat(60));

  const { data: allGrants } = await supabase
    .from("funding_grants")
    .select("org_id, amount")
    .not("org_id", "is", null);

  if (!allGrants || allGrants.length === 0) {
    console.log("   No linked grants found");
    return;
  }

  const orgTotals = {};
  allGrants.forEach(g => {
    if (g.org_id) orgTotals[g.org_id] = (orgTotals[g.org_id] || 0) + (g.amount || 0);
  });

  let updated = 0;
  const entries = Object.entries(orgTotals);
  for (let i = 0; i < entries.length; i++) {
    const [orgId, total] = entries[i];
    const { error } = await supabase
      .from("organisations")
      .update({ total_grant_amount: total })
      .eq("id", orgId);
    if (!error) updated++;
    if (i % 500 === 0 && i > 0) console.log(`   Progress: ${i}/${entries.length}`);
  }
  console.log(`   ✓ Updated total_grant_amount for ${updated} organisations`);
}

// ─── MAIN ───────────────────────────────────────────────────
async function main() {
  console.log("\n🏟️  OpenBenefacts — Gov.ie Sports Capital Importer");
  console.log("=".repeat(60));

  // Load orgs
  console.log("Loading organisations...");
  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);
  console.log(`   ${orgs.length} total organisations loaded`);

  // Ensure funder
  const funderId = await ensureFunder("Dept of Tourism, Culture, Arts, Gaeltacht, Sport & Media");
  console.log(`   Funder ID: ${funderId}`);

  // Step 1: Download SCEP 2023 data
  const grants2023 = await downloadSCEP2023();

  // Step 2: Fix orphaned grants from previous imports
  await fixOrphanedGrants(lookups);

  // Step 3: Import new grants
  let result = { matched: 0, created: 0, inserted: 0, skipped: 0, errors: 0 };
  if (grants2023.length > 0) {
    result = await importGrants(grants2023, funderId, lookups);
  }

  // Step 4: Recalculate totals
  await recalcGrantTotals();

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏟️  Gov.ie SCEP Import Summary`);
  console.log(`   Grants from 2023 CSV:   ${grants2023.length}`);
  console.log(`   Inserted:               ${result.inserted}`);
  console.log(`   Matched to existing:    ${result.matched}`);
  console.log(`   New orgs created:       ${result.created}`);
  console.log(`   Skipped (dupes):        ${result.skipped}`);
  console.log(`   Errors:                 ${result.errors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

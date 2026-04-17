#!/usr/bin/env node
/**
 * cleanup_and_import_sports.cjs
 * ============================================================
 * 1. Deletes all garbage Sports Capital grants (year-as-name entries)
 * 2. Downloads the real 2023 SCEP Applications CSV from gov.ie
 * 3. Imports individual club grants with proper org matching/creation
 * 4. Links orphaned grants to organisations
 *
 * Run:  node scripts/cleanup_and_import_sports.cjs
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
const SCEP_2023_CSV = "https://assets.gov.ie/static/documents/sports-capital-and-equipment-programme-2023-applications.csv";

// ─── Utils ──────────────────────────────────────────────────
function normalise(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(THE|LTD\.?|LIMITED|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s&']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    if (o.name) byName[o.name.trim().toUpperCase()] = o;
  });
  return { byNorm, byName };
}

function findMatch(name, county, lookups) {
  if (!name) return null;
  const norm = normalise(name);
  const upper = name.trim().toUpperCase();

  if (lookups.byName[upper]) return lookups.byName[upper];
  if (lookups.byNorm[norm]) return lookups.byNorm[norm];

  // With common suffixes removed
  const stripped = norm
    .replace(/\b(GAA|CLG|CLUB|RFC|AFC|FC|HURLING|CAMOGIE|SOCCER|RUGBY|ATHLETIC|ATHLETICS|SWIMMING|TENNIS|GOLF|HOCKEY|BOXING|ROWING|CRICKET|BASKETBALL|HANDBALL|COMMUNITY|PARISH|DEVELOPMENT|ASSOCIATION|SOCIETY)\b/g, "")
    .replace(/\s+/g, " ").trim();
  if (stripped && stripped.length > 4 && lookups.byNorm[stripped]) return lookups.byNorm[stripped];

  // Substring match with county preference
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

// ─── Step 1: Clean up garbage grants ────────────────────────
async function cleanupGarbageGrants() {
  console.log("\n🧹 Step 1: Cleaning up garbage Sports Capital grants...");
  console.log("─".repeat(60));

  // Delete grants where recipient_name_raw is just a year number
  const yearNames = ["2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023"];

  let totalDeleted = 0;
  for (const yearName of yearNames) {
    const { data, error } = await supabase
      .from("funding_grants")
      .delete()
      .eq("recipient_name_raw", yearName)
      .select("id");
    if (data) {
      totalDeleted += data.length;
      if (data.length > 0) console.log(`   Deleted ${data.length} grants with name="${yearName}"`);
    }
    if (error) console.log(`   Error deleting "${yearName}": ${error.message}`);
  }

  // Also delete grants with very small amounts (likely €M summary values, not real grants)
  // Real Sports Capital grants range from €1,000 to €5,000,000
  const { data: tinyGrants } = await supabase
    .from("funding_grants")
    .delete()
    .ilike("programme", "%Sports Capital%")
    .lt("amount", 500)
    .select("id");
  if (tinyGrants) {
    totalDeleted += tinyGrants.length;
    console.log(`   Deleted ${tinyGrants.length} grants with amount < €500 (summary values)`);
  }

  console.log(`   ✓ Total garbage grants removed: ${totalDeleted}`);
}

// ─── Step 2: Download and parse 2023 SCEP CSV ───────────────
async function downloadSCEP2023() {
  console.log("\n📥 Step 2: Downloading 2023 SCEP Applications from gov.ie...");
  console.log("─".repeat(60));

  let text;
  const localFile = path.join(DATA_DIR, "scep_2023_applications.csv");

  try {
    const resp = await fetch(SCEP_2023_CSV, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
    console.log(`   ✓ Downloaded (${(text.length / 1024).toFixed(0)} KB)`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(localFile, text);
  } catch (e) {
    console.log(`   ✗ Download failed: ${e.message}`);
    if (fs.existsSync(localFile)) {
      console.log(`   → Using local copy`);
      text = fs.readFileSync(localFile, "utf8");
    } else {
      console.log(`   → No local copy found either.`);
      console.log(`   💡 Please download manually from:`);
      console.log(`      ${SCEP_2023_CSV}`);
      console.log(`      Save to: ${localFile}`);
      return [];
    }
  }

  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Use index-based parsing to avoid header key mismatch issues
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headerLine = parseCSVLine(lines[0]);
  const headers = headerLine.map(h => h.trim());
  console.log(`   ✓ ${lines.length - 1} data rows`);
  console.log(`   Headers (${headers.length}): ${headers.join(" | ")}`);

  // Find column INDICES
  const nameIdx = headers.findIndex(h => /organisation|applicant|club|grantee|recipient|name/i.test(h));
  const amountIdx = headers.findIndex(h => /amount|allocation|approved|granted/i.test(h));
  const countyIdx = headers.findIndex(h => /county/i.test(h));
  const sportIdx = headers.findIndex(h => /sport/i.test(h));
  const statusIdx = headers.findIndex(h => /status|outcome|decision/i.test(h));
  const grantCatIdx = headers.findIndex(h => /grant\s*category/i.test(h));

  console.log(`\n   Column indices:`);
  console.log(`     Name [${nameIdx}]:    "${nameIdx >= 0 ? headers[nameIdx] : 'NOT FOUND'}"`);
  console.log(`     Amount [${amountIdx}]: "${amountIdx >= 0 ? headers[amountIdx] : 'NOT FOUND'}"`);
  console.log(`     County [${countyIdx}]: "${countyIdx >= 0 ? headers[countyIdx] : 'NOT FOUND'}"`);
  console.log(`     Sport [${sportIdx}]:   "${sportIdx >= 0 ? headers[sportIdx] : 'NOT FOUND'}"`);
  console.log(`     Status [${statusIdx}]: "${statusIdx >= 0 ? headers[statusIdx] : 'NOT FOUND'}"`);

  // Show first row by index for debugging
  const firstVals = parseCSVLine(lines[1]);
  console.log(`\n   First data row by index:`);
  if (nameIdx >= 0) console.log(`     Name:   "${(firstVals[nameIdx] || "").trim()}"`);
  if (amountIdx >= 0) console.log(`     Amount: "${(firstVals[amountIdx] || "").trim()}" → parsed: ${parseAmount(firstVals[amountIdx])}`);
  if (countyIdx >= 0) console.log(`     County: "${(firstVals[countyIdx] || "").trim()}"`);

  const grants = [];
  let skippedNoName = 0, skippedNoAmount = 0;

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 2) continue;

    const name = nameIdx >= 0 ? (vals[nameIdx] || "").trim() : "";
    if (!name || name.length < 3) { skippedNoName++; continue; }

    // Get amount by index
    let amount = 0;
    if (amountIdx >= 0) amount = parseAmount(vals[amountIdx]);

    // Fallback: try every column for a euro amount
    if (amount === 0) {
      for (let c = 0; c < vals.length; c++) {
        const v = (vals[c] || "").trim();
        if (v.includes("€") || /^\d[\d,]+(\.\d+)?$/.test(v)) {
          const a = parseAmount(v);
          if (a > 500) { amount = a; break; }
        }
      }
    }
    if (amount <= 0) { skippedNoAmount++; continue; }

    const county = countyIdx >= 0 ? (vals[countyIdx] || "").trim() : "";
    const sport = sportIdx >= 0 ? (vals[sportIdx] || "").trim() : "";
    const status = statusIdx >= 0 ? (vals[statusIdx] || "").trim() : "";

    grants.push({
      name,
      amount,
      county,
      year: 2023,
      sport,
      status,
      programme: "Sports Capital & Equipment Programme 2023",
    });
  }

  console.log(`\n   ✓ ${grants.length} valid grants extracted`);
  console.log(`   ⚠ ${skippedNoName} skipped (no name), ${skippedNoAmount} skipped (no amount)`);

  if (grants.length > 0) {
    console.log(`\n   First 5 grants:`);
    grants.slice(0, 5).forEach(g => {
      console.log(`     ${g.name} — €${g.amount.toLocaleString()} — ${g.county} — ${g.sport}`);
    });
  }

  return grants;
}

// ─── Step 3: Import grants ──────────────────────────────────
async function importGrants(grants, funderId, lookups) {
  console.log(`\n📥 Step 3: Importing ${grants.length} grants...`);
  console.log("─".repeat(60));

  let matched = 0, created = 0, inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    if (i % 500 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${grants.length} (${inserted} ins, ${matched} match, ${created} new, ${skipped} skip)`);
    }

    let org = findMatch(g.name, g.county, lookups);
    let orgId = org?.id || null;

    if (!orgId) {
      // Create new org — NOTE: organisations table has these columns:
      // id, name, name_normalised, also_known_as, charity_number, cro_number,
      // revenue_chy, sector, subsector, county, address, eircode, governing_form,
      // date_incorporated, status, benefacts_id, created_at, updated_at, fts,
      // cro_company_type, cro_company_status
      try {
        const newOrg = {
          name: g.name.trim(),
          name_normalised: normalise(g.name),
          sector: "Recreation, Sports",
          subsector: g.sport ? `Sport — ${g.sport}` : "Sports organisations",
          county: g.county || null,
        };
        const { data: createdOrg, error: createErr } = await supabase
          .from("organisations")
          .insert(newOrg)
          .select("id, name")
          .single();

        if (createErr) {
          // Name might already exist — find it
          const { data: found } = await supabase
            .from("organisations")
            .select("id, name")
            .ilike("name", g.name.trim())
            .maybeSingle();
          if (found) {
            orgId = found.id;
            matched++;
          }
        } else {
          orgId = createdOrg.id;
          created++;
          const n = normalise(g.name);
          if (n) lookups.byNorm[n] = { id: orgId, name: g.name, county: g.county };
          lookups.byName[g.name.trim().toUpperCase()] = { id: orgId, name: g.name };
        }
      } catch (e) { /* continue with null orgId */ }
    } else {
      matched++;
    }

    // Check for duplicate
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

// ─── Step 4: Fix orphaned grants ────────────────────────────
async function fixOrphanedGrants(lookups) {
  console.log("\n🔧 Step 4: Linking orphaned grants to organisations...");
  console.log("─".repeat(60));

  let offset = 0;
  let linked = 0, created = 0, stillOrphan = 0;
  const batchSize = 500;

  while (true) {
    const { data: orphans } = await supabase
      .from("funding_grants")
      .select("id, recipient_name_raw")
      .is("org_id", null)
      .range(offset, offset + batchSize - 1);

    if (!orphans || orphans.length === 0) break;

    for (const g of orphans) {
      const name = g.recipient_name_raw;
      if (!name || name.length < 3) { stillOrphan++; continue; }

      let org = findMatch(name, null, lookups);

      if (!org) {
        // Try creating
        try {
          const { data: createdOrg, error: createErr } = await supabase
            .from("organisations")
            .insert({
              name: name.trim(),
              name_normalised: normalise(name),
              sector: "Recreation, Sports",
            })
            .select("id, name")
            .single();

          if (createErr) {
            const { data: found } = await supabase
              .from("organisations")
              .select("id")
              .ilike("name", name.trim())
              .maybeSingle();
            if (found) { org = found; linked++; }
            else { stillOrphan++; continue; }
          } else {
            org = createdOrg;
            created++;
            const n = normalise(name);
            if (n) lookups.byNorm[n] = { id: createdOrg.id, name: name };
          }
        } catch (e) { stillOrphan++; continue; }
      } else {
        linked++;
      }

      if (org) {
        await supabase.from("funding_grants").update({ org_id: org.id }).eq("id", g.id);
      }
    }

    if (orphans.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`   ✓ Linked to existing: ${linked}`);
  console.log(`   ✓ New orgs created:   ${created}`);
  console.log(`   ✗ Still orphaned:     ${stillOrphan}`);
}

// ─── MAIN ───────────────────────────────────────────────────
async function main() {
  console.log("\n🏟️  OpenBenefacts — Sports Capital Cleanup & Import");
  console.log("=".repeat(60));

  console.log("Loading organisations...");
  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);
  console.log(`   ${orgs.length} organisations loaded`);

  const funderId = await ensureFunder("Dept of Tourism, Culture, Arts, Gaeltacht, Sport & Media");
  console.log(`   Funder ID: ${funderId}`);

  // Step 1: Clean garbage
  await cleanupGarbageGrants();

  // Step 2: Download 2023 SCEP
  const grants2023 = await downloadSCEP2023();

  // Step 3: Import
  let result = { matched: 0, created: 0, inserted: 0, skipped: 0, errors: 0 };
  if (grants2023.length > 0) {
    result = await importGrants(grants2023, funderId, lookups);
  }

  // Step 4: Fix orphans
  await fixOrphanedGrants(lookups);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏟️  Sports Capital Import Summary`);
  console.log(`   Garbage grants cleaned:  ✓`);
  console.log(`   2023 CSV grants:         ${grants2023.length}`);
  console.log(`   Inserted:                ${result.inserted}`);
  console.log(`   Matched to existing org: ${result.matched}`);
  console.log(`   New orgs created:        ${result.created}`);
  console.log(`   Skipped (dupes):         ${result.skipped}`);
  console.log(`   Errors:                  ${result.errors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

#!/usr/bin/env node
/**
 * import_hse_section38_39.cjs
 * ============================================================
 * Downloads the official HSE Section 38 & 39 funded organisations
 * Excel file from assets.gov.ie and imports into OpenBenefacts.
 *
 * Data source:
 *   https://assets.gov.ie/247584/c223c6e7-2d32-4ace-923d-4b263ec7df07.xlsx
 *   (Published by HSE / Dept of Health)
 *
 * Also tries to download supplementary Section 39 data from HSE.ie
 *
 * Requires: npm install xlsx dotenv @supabase/supabase-js
 * Run:      node scripts/import_hse_section38_39.cjs
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

let XLSX;
try {
  XLSX = require("xlsx");
} catch (e) {
  console.error("Missing xlsx package. Install with: npm install xlsx");
  process.exit(1);
}

require("dotenv").config();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ilkwspvhqedzjreysuxu.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_KEY) { console.error("Missing SUPABASE_SERVICE_KEY in .env"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "..", "data", "hse");
const HSE_XLSX_URL = "https://assets.gov.ie/247584/c223c6e7-2d32-4ace-923d-4b263ec7df07.xlsx";

// ─── Helpers ───────────────────────────────────────────────
function normalise(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(THE|LTD\.?|LIMITED|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s&']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(str) {
  if (!str) return 0;
  if (typeof str === "number") return Math.round(str);
  const cleaned = String(str).replace(/[€$£\s]/g, "").replace(/,/g, "");
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

function findMatch(name, lookups) {
  if (!name) return null;
  const norm = normalise(name);
  const upper = name.trim().toUpperCase();
  if (lookups.byName[upper]) return lookups.byName[upper];
  if (lookups.byNorm[norm]) return lookups.byNorm[norm];

  // Fuzzy substring match
  for (const [key, org] of Object.entries(lookups.byNorm)) {
    if (key.length < 6) continue;
    if (norm.includes(key) || key.includes(norm)) {
      if (Math.abs(key.length - norm.length) < 15) return org;
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

// ─── Download and parse HSE XLSX ────────────────────────────
async function downloadAndParseHSE() {
  console.log("\n📥 Downloading HSE Section 38/39 data...");
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const filename = path.join(DATA_DIR, "hse_section38_39.xlsx");
  const allGrants = [];

  // Download if not cached
  if (!fs.existsSync(filename)) {
    console.log(`   📥 Downloading from assets.gov.ie...`);
    try {
      const resp = await fetch(HSE_XLSX_URL, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) {
        console.log(`   ✗ HTTP ${resp.status} — will use fallback data`);
        return allGrants;
      }
      const buffer = await resp.arrayBuffer();
      fs.writeFileSync(filename, Buffer.from(buffer));
      console.log(`   ✓ Saved (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.log(`   ✗ Download failed: ${e.message} — will use fallback data`);
      return allGrants;
    }
  } else {
    console.log("   📁 Using cached XLSX");
  }

  // Parse XLSX
  const workbook = XLSX.readFile(filename);
  console.log(`   Sheets: ${workbook.SheetNames.join(", ")}`);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    console.log(`\n   Processing sheet "${sheetName}" (${rows.length} rows)...`);

    if (rows.length === 0) continue;

    // Try to identify columns — look for org name and amount columns
    const headers = Object.keys(rows[0]);
    console.log(`   Columns: ${headers.join(", ")}`);

    // Detect which columns contain org names and amounts
    let nameCol = headers.find(h => /organisation|agency|name|body|provider|service/i.test(h));
    let amountCol = headers.find(h => /amount|funding|allocation|total|value|€/i.test(h));
    let typeCol = headers.find(h => /section|type|category/i.test(h));
    let yearCol = headers.find(h => /year/i.test(h));

    // If we can't auto-detect, try first two columns
    if (!nameCol && headers.length >= 1) nameCol = headers[0];
    if (!amountCol && headers.length >= 2) amountCol = headers[headers.length - 1];

    console.log(`   Name col: "${nameCol}", Amount col: "${amountCol}"`);

    for (const row of rows) {
      const orgName = String(row[nameCol] || "").trim();
      if (!orgName || orgName.length < 3) continue;
      // Skip header-like rows
      if (/^(organisation|agency|name|total|sub-total)/i.test(orgName)) continue;

      const amount = parseAmount(row[amountCol]);
      if (amount < 1000) continue; // Skip tiny amounts or non-numeric

      const section = typeCol ? String(row[typeCol] || "").trim() : "";
      const year = yearCol ? parseInt(row[yearCol]) : 2023; // Default year if not in file
      const programme = section.includes("38") ? "Section 38" :
                        section.includes("39") ? "Section 39" :
                        sheetName.includes("38") ? "Section 38" :
                        sheetName.includes("39") ? "Section 39" : "HSE Funded Agency";

      allGrants.push({
        name: orgName,
        amount,
        year: isNaN(year) ? 2023 : year,
        programme,
      });
    }
  }

  console.log(`\n   ✓ Extracted ${allGrants.length} grants from XLSX`);
  return allGrants;
}

// ─── Import grants ──────────────────────────────────────────
async function importGrants(grants, funderId, lookups) {
  console.log(`\n📥 Importing ${grants.length} HSE grants...`);

  let matched = 0, inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];

    // Find matching org
    const org = findMatch(g.name, lookups);
    const orgId = org?.id || null;
    if (orgId) matched++;

    // Check for duplicate
    const { data: existing } = await supabase
      .from("funding_grants")
      .select("id")
      .eq("funder_id", funderId)
      .eq("recipient_name_raw", g.name)
      .eq("amount", g.amount)
      .eq("year", g.year)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    const { error } = await supabase.from("funding_grants").insert({
      funder_id: funderId,
      org_id: orgId,
      recipient_name_raw: g.name,
      programme: g.programme,
      amount: g.amount,
      year: g.year,
      source: "hse_assets_gov_ie_xlsx",
    });

    if (error) {
      errors++;
      if (errors <= 5) console.log(`   ✗ ${g.name}: ${error.message}`);
    } else {
      inserted++;
    }

    if (i % 100 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${grants.length}`);
    }
  }

  return { matched, inserted, skipped, errors };
}

// ─── MAIN ───────────────────────────────────────────────────
async function main() {
  console.log("\n🏥 OpenBenefacts — HSE Section 38/39 Importer");
  console.log("=".repeat(60));

  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);
  console.log(`   ${orgs.length} organisations loaded`);

  const funderId = await ensureFunder("HSE / Dept of Health");
  console.log(`   Funder ID: ${funderId}`);

  const grants = await downloadAndParseHSE();

  if (grants.length === 0) {
    console.log("\n   No grants extracted from XLSX. The file format may have changed.");
    console.log("   Check the downloaded file at: " + path.join(DATA_DIR, "hse_section38_39.xlsx"));
    return;
  }

  const result = await importGrants(grants, funderId, lookups);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏥 HSE Import Summary`);
  console.log(`   Total extracted:    ${grants.length}`);
  console.log(`   Inserted:           ${result.inserted}`);
  console.log(`   Matched to orgs:    ${result.matched}`);
  console.log(`   Skipped (dupes):    ${result.skipped}`);
  console.log(`   Errors:             ${result.errors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

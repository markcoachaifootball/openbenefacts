#!/usr/bin/env node
/**
 * import_scep_pdfs.cjs
 * ============================================================
 * Downloads and parses the official Sports Capital Programme
 * payment PDFs from gov.ie (2011–2025), extracts club-level
 * grant payments, and imports into OpenBenefacts.
 *
 * Requires: npm install pdf-parse
 * Run:      node scripts/import_scep_pdfs.cjs
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

let pdfParse;
try {
  const pdfModule = require("pdf-parse");
  // Handle both CommonJS default export and direct function export
  console.log("pdf-parse type:", typeof pdfModule, "keys:", Object.keys(pdfModule || {}).join(","));
  pdfParse = typeof pdfModule === "function" ? pdfModule : (pdfModule.default || pdfModule);
  if (typeof pdfParse !== "function") {
    // Fallback: try requiring the internal module directly
    try { pdfParse = require("pdf-parse/lib/pdf-parse.js"); } catch {}
  }
  if (typeof pdfParse !== "function") {
    // Last resort: use pdfjs-dist directly
    console.log("pdf-parse function not found. Trying manual PDF text extraction...");
    pdfParse = null;
  }
} catch (e) {
  console.error("Missing pdf-parse. Install with: npm install pdf-parse");
  console.error("Error:", e.message);
  process.exit(1);
}

require("dotenv").config();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ilkwspvhqedzjreysuxu.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_KEY) { console.error("Missing SUPABASE_SERVICE_KEY in .env"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "..", "data", "oscar", "pdfs");

// ─── Payment PDF URLs from gov.ie ───────────────────────────
const PAYMENT_PDFS = [
  { year: 2019, url: "https://assets.gov.ie/static/documents/sports-capital-programme-payments-2019.pdf" },
  { year: 2020, url: "https://assets.gov.ie/static/documents/sports-capital-programme-payments-2020.pdf" },
  { year: 2021, url: "https://assets.gov.ie/static/documents/sports-capital-programme-payments-2021.pdf" },
  { year: 2022, url: "https://assets.gov.ie/static/documents/sports-capital-and-equipment-programme-payments-2022.pdf" },
  { year: 2023, url: "https://assets.gov.ie/static/documents/sports-capital-and-equipment-programme-payments-2023.pdf" },
  { year: 2024, url: "https://assets.gov.ie/static/documents/community-sport-facilities-fund-2024.pdf" },
  { year: 2025, url: "https://assets.gov.ie/static/documents/community-sport-facilities-fund-payments-2025.pdf" },
];

// Also the equipment allocations
const EQUIPMENT_ALLOCATIONS_PDF = "https://assets.gov.ie/static/documents/updated-scep-23-equipment-only-provisional-allocations.pdf";

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

function parseAmount(str) {
  if (!str) return 0;
  // Handle various euro formats: €25,000 / €25,000.00 / 25000 / €25.000,00
  const cleaned = String(str)
    .replace(/[€$£\s]/g, "")
    .replace(/,(\d{2})$/, ".$1")   // €25.000,00 → 25000.00
    .replace(/,/g, "");            // €25,000 → 25000
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

  const stripped = norm
    .replace(/\b(GAA|CLG|CLUB|RFC|AFC|FC|HURLING|CAMOGIE|SOCCER|RUGBY|ATHLETIC|ATHLETICS|SWIMMING|TENNIS|GOLF|HOCKEY|BOXING|ROWING|CRICKET|BASKETBALL|HANDBALL|COMMUNITY|PARISH|DEVELOPMENT|ASSOCIATION|SOCIETY)\b/g, "")
    .replace(/\s+/g, " ").trim();
  if (stripped && stripped.length > 4 && lookups.byNorm[stripped]) return lookups.byNorm[stripped];

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

// ─── Extract grants from PDF text ───────────────────────────
function extractGrantsFromText(text, year) {
  const grants = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 3);

  // Sports Capital PDFs typically have lines like:
  //   "Club Name     County     €25,000"
  //   "Club Name  €25,000.00  €15,000.00"
  // Or tabular: "Organisation | County | Approved | Paid"

  // Strategy: find lines containing euro amounts and extract org name
  const euroRegex = /€[\d,]+(\.\d{2})?/g;
  const amountRegex = /€([\d,]+(?:\.\d{2})?)/;

  for (const line of lines) {
    const amounts = line.match(euroRegex);
    if (!amounts || amounts.length === 0) continue;

    // Get the last amount on the line (usually "paid" or "total")
    const lastAmountStr = amounts[amounts.length - 1];
    const amount = parseAmount(lastAmountStr);
    if (amount < 500 || amount > 10000000) continue; // Filter unreasonable amounts

    // Extract org name: everything before the first euro amount
    const firstAmountPos = line.indexOf(amounts[0]);
    let orgName = line.substring(0, firstAmountPos).trim();

    // Clean up: remove county names that might be appended, trailing numbers
    orgName = orgName.replace(/\s+\d+$/, "").trim();
    // Remove leading numbers (row numbers)
    orgName = orgName.replace(/^\d+[\s.)\-]+/, "").trim();

    if (!orgName || orgName.length < 4) continue;
    // Skip header-like lines
    if (/^(organisation|club|applicant|name|county|total|grant|amount|paid|approved)/i.test(orgName)) continue;

    // Try to extract county if it appears between org name and amounts
    let county = "";
    const countyMatch = orgName.match(/\s+(Dublin|Cork|Galway|Limerick|Waterford|Kerry|Tipperary|Clare|Wexford|Donegal|Meath|Kildare|Wicklow|Louth|Westmeath|Offaly|Laois|Kilkenny|Carlow|Cavan|Monaghan|Sligo|Mayo|Roscommon|Longford|Leitrim|Fermanagh|Tyrone|Derry|Antrim|Armagh|Down)$/i);
    if (countyMatch) {
      county = countyMatch[1];
      orgName = orgName.substring(0, countyMatch.index).trim();
    }

    grants.push({
      name: orgName,
      amount,
      county,
      year,
      programme: `Sports Capital Programme Payments ${year}`,
    });
  }

  return grants;
}

// ─── Download and parse PDFs ────────────────────────────────
async function downloadAndParsePDFs() {
  console.log("\n📥 Downloading and parsing Sports Capital payment PDFs...");
  console.log("─".repeat(60));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const allGrants = [];

  for (const pdf of PAYMENT_PDFS) {
    const filename = path.join(DATA_DIR, `payments_${pdf.year}.pdf`);

    try {
      // Download if not already cached
      if (!fs.existsSync(filename)) {
        console.log(`\n   📥 Downloading ${pdf.year}...`);
        const resp = await fetch(pdf.url, { signal: AbortSignal.timeout(30000) });
        if (!resp.ok) { console.log(`   ✗ HTTP ${resp.status}`); continue; }
        const buffer = await resp.arrayBuffer();
        fs.writeFileSync(filename, Buffer.from(buffer));
        console.log(`   ✓ Saved (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
      } else {
        console.log(`\n   📁 Using cached ${pdf.year} PDF`);
      }

      // Parse
      const dataBuffer = fs.readFileSync(filename);
      let pdfText = "";
      if (pdfParse && typeof pdfParse === "function") {
        const pdfData = await pdfParse(dataBuffer);
        pdfText = pdfData.text;
        console.log(`   ✓ Extracted text (${pdfText.length} chars, ${pdfData.numpages} pages)`);
      } else {
        // Fallback: raw text extraction from PDF binary
        const rawStr = dataBuffer.toString("latin1");
        // Extract text between BT/ET blocks (PDF text objects)
        const textMatches = rawStr.match(/\(([^)]+)\)/g) || [];
        pdfText = textMatches.map(m => m.slice(1, -1)).join("\n");
        console.log(`   ✓ Raw extracted (${pdfText.length} chars)`);
      }

      const grants = extractGrantsFromText(pdfText, pdf.year);
      console.log(`   ✓ Found ${grants.length} grants`);

      if (grants.length > 0) {
        console.log(`   Sample: ${grants[0].name} — €${grants[0].amount.toLocaleString()}`);
      }

      allGrants.push(...grants);
    } catch (e) {
      console.log(`   ✗ ${pdf.year}: ${e.message}`);
    }
  }

  // Also try the equipment allocations PDF
  try {
    const eqFilename = path.join(DATA_DIR, "equipment_allocations_2023.pdf");
    if (!fs.existsSync(eqFilename)) {
      console.log(`\n   📥 Downloading Equipment Allocations 2023...`);
      const resp = await fetch(EQUIPMENT_ALLOCATIONS_PDF, { signal: AbortSignal.timeout(30000) });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        fs.writeFileSync(eqFilename, Buffer.from(buffer));
        const eqBuf = Buffer.from(buffer);
        let eqText = "";
        if (pdfParse && typeof pdfParse === "function") {
          const pdfData = await pdfParse(eqBuf);
          eqText = pdfData.text;
        } else {
          const rawStr = eqBuf.toString("latin1");
          const textMatches = rawStr.match(/\(([^)]+)\)/g) || [];
          eqText = textMatches.map(m => m.slice(1, -1)).join("\n");
        }
        const grants = extractGrantsFromText(eqText, 2023);
        console.log(`   ✓ Equipment allocations: ${grants.length} grants`);
        allGrants.push(...grants);
      }
    } else {
      const dataBuffer = fs.readFileSync(eqFilename);
      let eqText = "";
      if (pdfParse && typeof pdfParse === "function") {
        const pdfData = await pdfParse(dataBuffer);
        eqText = pdfData.text;
      } else {
        const rawStr = dataBuffer.toString("latin1");
        const textMatches = rawStr.match(/\(([^)]+)\)/g) || [];
        eqText = textMatches.map(m => m.slice(1, -1)).join("\n");
      }
      const grants = extractGrantsFromText(eqText, 2023);
      console.log(`   ✓ Equipment allocations (cached): ${grants.length} grants`);
      allGrants.push(...grants);
    }
  } catch (e) {
    console.log(`   ✗ Equipment allocations: ${e.message}`);
  }

  return allGrants;
}

// ─── Import grants ──────────────────────────────────────────
async function importGrants(grants, funderId, lookups) {
  console.log(`\n📥 Importing ${grants.length} grants to Supabase...`);
  console.log("─".repeat(60));

  // Deduplicate
  const seen = new Set();
  const unique = grants.filter(g => {
    const key = `${normalise(g.name)}|${g.amount}|${g.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`   ${unique.length} unique grants after dedup`);

  let matched = 0, created = 0, inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < unique.length; i++) {
    const g = unique[i];
    if (i % 200 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${unique.length} (${inserted} ins, ${matched} match, ${created} new)`);
    }

    let org = findMatch(g.name, g.county, lookups);
    let orgId = org?.id || null;

    if (!orgId) {
      try {
        const { data: createdOrg, error: createErr } = await supabase
          .from("organisations")
          .insert({
            name: g.name.trim(),
            name_normalised: normalise(g.name),
            sector: "Recreation, Sports",
            subsector: "Sports organisations",
            county: g.county || null,
          })
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
          if (n) lookups.byNorm[n] = { id: orgId, name: g.name };
          lookups.byName[g.name.trim().toUpperCase()] = { id: orgId, name: g.name };
        }
      } catch (e) { /* continue */ }
    } else {
      matched++;
    }

    // Check duplicate
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

// ─── MAIN ───────────────────────────────────────────────────
async function main() {
  console.log("\n🏟️  OpenBenefacts — Sports Capital PDF Importer");
  console.log("=".repeat(60));

  console.log("Loading organisations...");
  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);
  console.log(`   ${orgs.length} organisations loaded`);

  const funderId = await ensureFunder("Dept of Tourism, Culture, Arts, Gaeltacht, Sport & Media");
  console.log(`   Funder ID: ${funderId}`);

  // Download and parse all PDFs
  const allGrants = await downloadAndParsePDFs();
  console.log(`\n📊 Total grants extracted from PDFs: ${allGrants.length}`);

  if (allGrants.length === 0) {
    console.log("   No grants extracted. Check PDF format.");
    return;
  }

  // Import
  const result = await importGrants(allGrants, funderId, lookups);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏟️  Sports Capital PDF Import Summary`);
  console.log(`   Total extracted:    ${allGrants.length}`);
  console.log(`   Inserted:           ${result.inserted}`);
  console.log(`   Matched existing:   ${result.matched}`);
  console.log(`   New orgs created:   ${result.created}`);
  console.log(`   Skipped (dupes):    ${result.skipped}`);
  console.log(`   Errors:             ${result.errors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

#!/usr/bin/env node
/**
 * scrape_ocds_accommodation.cjs
 * ============================================================
 * Reads the Irish OGP open-data procurement dump and extracts
 * every contract related to emergency / homeless / hotel-based
 * accommodation, upserting providers + contracts to Supabase.
 *
 * Data source:
 *   https://assets.gov.ie/static/documents/7ba65f1b/Public_Procurement_Opendata_Dataset.csv
 *   (~100k rows of every contract on eTenders, all sectors)
 *
 * Columns (CSV header):
 *   Tender ID, Parent Agreement ID, Contracting Authority,
 *   Name of Client Contracting Authority, Agreement Owner,
 *   Tender/Contract Name, Notice Published Date/Contract Created Date,
 *   Directive, Competition Type, Main Cpv Code, Main Cpv Code Description,
 *   Additional CPV Codes on CFT, Spend Category, Contract Type,
 *   Threshold Level, Procedure, Tender Submission Deadline,
 *   Evaluation Type, Notice Estimated Value (€), Contract Duration (Months),
 *   Cancelled Date, Award Published, Awarded Value (€), No of Bids Received,
 *   No of SMEs Bids Received, Awarded Suppliers, No of Awarded SMEs,
 *   TED Notice Link, TED CAN Link, Platform
 * ============================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Missing SUPABASE creds"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_PATH = path.join(__dirname, "..", "data", "ocds", "procurement.csv");

// ─── Accommodation-related CPV codes ─────────────────────────
// https://simap.ted.europa.eu/cpv
const CPV_ACCOMMODATION = new Set([
  "55100000", // Hotel services
  "55110000", // Hotel accommodation
  "55200000", // Tourist camps / non-hotel accommodation
  "55210000", // Youth hostel
  "55220000", // Camping
  "55240000", // Holiday centres
  "55250000", // Short-stay furnished accommodation
  "55270000", // Bed and breakfast
  "85311000", // Social work services with accommodation
  "85311200", // Welfare services for the homeless
  "85311300", // Welfare services for children and young people
  "85312100", // Day-care services
  "98341000", // Accommodation services
  "98341100", // Accommodation management services
  "98341120", // Supported housing
  "98341130", // Accommodation management
]);

// Fallback keyword search on tender/contract name (case-insensitive)
const NAME_KEYWORDS = [
  "emergency accommodation", "homeless", "homelessness",
  "private emergency", "supported temporary", "family hub",
  "rough sleep", "hotel accommodation", "bed and breakfast",
  "b&b", "hostel", "sheltered accommodation", "refuge",
  "domestic violence accommodation",
];

// ─── LA classifier ───────────────────────────────────────────
const LA_PATTERNS = [
  [/dublin\s*city/i,               "Dublin City Council",                   "Dublin Region"],
  [/d[uú]n\s*laoghaire|\bdlr\b/i,  "Dún Laoghaire-Rathdown County Council", "Dublin Region"],
  [/fingal/i,                      "Fingal County Council",                 "Dublin Region"],
  [/south\s*dublin/i,              "South Dublin County Council",           "Dublin Region"],
  [/drhe|dublin\s*region(al)?\s*homeless/i, "Dublin City Council",          "Dublin Region"],
  [/cork\s*city/i,                 "Cork City Council",                     "South"],
  [/cork\s*(county|co\.?)/i,       "Cork County Council",                   "South"],
  [/kerry/i,                       "Kerry County Council",                  "South"],
  [/limerick/i,                    "Limerick City & County Council",        "Mid-West"],
  [/clare/i,                       "Clare County Council",                  "Mid-West"],
  [/tipperary/i,                   "Tipperary County Council",              "Mid-West"],
  [/galway\s*city/i,               "Galway City Council",                   "West"],
  [/galway\s*(county|co\.?)/i,     "Galway County Council",                 "West"],
  [/mayo/i,                        "Mayo County Council",                   "West"],
  [/roscommon/i,                   "Roscommon County Council",              "West"],
  [/waterford/i,                   "Waterford City & County Council",       "South-East"],
  [/wexford/i,                     "Wexford County Council",                "South-East"],
  [/kilkenny/i,                    "Kilkenny County Council",               "South-East"],
  [/carlow/i,                      "Carlow County Council",                 "South-East"],
  [/kildare/i,                     "Kildare County Council",                "Mid-East"],
  [/meath/i,                       "Meath County Council",                  "Mid-East"],
  [/wicklow/i,                     "Wicklow County Council",                "Mid-East"],
  [/donegal/i,                     "Donegal County Council",                "Border"],
  [/louth/i,                       "Louth County Council",                  "Border"],
  [/cavan/i,                       "Cavan County Council",                  "Border"],
  [/monaghan/i,                    "Monaghan County Council",               "Border"],
  [/sligo/i,                       "Sligo County Council",                  "Border"],
  [/leitrim/i,                     "Leitrim County Council",                "North-West"],
  [/laois/i,                       "Laois County Council",                  "Midlands"],
  [/offaly/i,                      "Offaly County Council",                 "Midlands"],
  [/longford/i,                    "Longford County Council",               "Midlands"],
  [/westmeath/i,                   "Westmeath County Council",              "Midlands"],
];
function classifyLA(text) {
  for (const [re, la, region] of LA_PATTERNS) if (re.test(text || "")) return { la, region };
  return { la: null, region: null };
}

function classifyProviderType(name) {
  const t = (name || "").toLowerCase();
  if (/\bhotel\b/.test(t))                return "Hotel";
  if (/\bb&b|bed\s*&?\s*breakfast/.test(t)) return "B&B";
  if (/\bhostel\b/.test(t))               return "Hostel";
  if (/\bapartment|apart-?hotel/.test(t)) return "Apartments";
  if (/\bfamily\s*hub\b/.test(t))         return "Family Hub";
  if (/\bclg|charity|company\s*limited\s*by\s*guarantee/.test(t)) return "Charity";
  if (/\bltd|limited|dac|plc\b/i.test(t)) return "Company";
  return "Unknown";
}

// ─── Tiny CSV parser (handles quoted fields + commas inside quotes) ──
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ',')      { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else                cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  // Row splitter that respects quoted newlines.
  const rows = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQ = !inQ;
    if ((c === "\n" || c === "\r") && !inQ) {
      if (cur) { rows.push(cur); cur = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else {
      cur += c;
    }
  }
  if (cur) rows.push(cur);
  const header = parseCsvLine(rows[0]);
  return rows.slice(1).map(r => {
    const cols = parseCsvLine(r);
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ""; });
    return obj;
  });
}

// ─── Date helper: DD/MM/YYYY → YYYY-MM-DD ────────────────────
function normDate(s) {
  if (!s || s === "NULL") return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normValue(s) {
  if (!s || s === "NULL") return null;
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isFinite(v) ? Math.round(v) : null;
}

// ─── Supabase helpers ────────────────────────────────────────
async function upsertProvider(name, ctx) {
  if (!name || name === "NULL") return null;
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length < 3 || clean.length > 120) return null;
  const { data: existing } = await supabase
    .from("emergency_providers")
    .select("id, source_count, total_known_revenue_eur")
    .ilike("name", clean)
    .maybeSingle();
  if (existing) {
    // Only update last_seen_date — revenue is recalculated at end from contracts
    const updates = { last_seen_date: ctx.date };
    if (!existing.source_count) updates.source_count = 1;
    await supabase.from("emergency_providers")
      .update(updates)
      .eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await supabase.from("emergency_providers").insert({
    name: clean,
    provider_type: classifyProviderType(clean),
    region: ctx.region, local_authority: ctx.la,
    first_seen_date: ctx.date, last_seen_date: ctx.date,
    source_count: 1,
    total_known_revenue_eur: ctx.value || 0,
  }).select("id").single();
  if (error) { console.warn(`   ! ${error.message}`); return null; }
  return data.id;
}

async function insertContract(row) {
  const { error } = await supabase.from("provider_contracts")
    .upsert(row, { onConflict: "source_type,source_reference" });
  if (error) console.warn(`   ! ${error.message}`);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n🏛️  OpenBenefacts — OCDS accommodation scraper");
  console.log("=".repeat(60));

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found at ${CSV_PATH}`);
    console.error(`   Run: curl -sL -o ${CSV_PATH} "https://assets.gov.ie/static/documents/7ba65f1b/Public_Procurement_Opendata_Dataset.csv"`);
    process.exit(1);
  }

  console.log(`\n1) Reading ${CSV_PATH}`);
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  console.log(`   ${(raw.length / 1e6).toFixed(1)} MB`);
  const rows = parseCsv(raw);
  console.log(`   ${rows.length} rows parsed`);

  console.log(`\n2) Filtering for accommodation-related contracts`);
  const nameRx = new RegExp(NAME_KEYWORDS.map(k => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|"), "i");

  const matches = rows.filter(r => {
    const cpv = (r["Main Cpv Code"] || "").split(/[;,\s]/)[0]; // first 8-digit code
    const addl = (r["Additional CPV Codes on CFT"] || "").split(/[;,\s]+/);
    const allCpvs = [cpv, ...addl].map(c => c.slice(0, 8));
    if (allCpvs.some(c => CPV_ACCOMMODATION.has(c))) return true;
    const name = (r["Tender/Contract Name"] || "") + " " + (r["Main Cpv Code Description"] || "");
    return nameRx.test(name);
  });
  console.log(`   ${matches.length} matching contracts (${((matches.length / rows.length) * 100).toFixed(2)}%)`);

  // Count by type for summary
  const byCpv = {};
  matches.forEach(m => {
    const c = (m["Main Cpv Code"] || "").slice(0, 8);
    byCpv[c] = (byCpv[c] || 0) + 1;
  });
  console.log(`   Top CPV codes in matches:`);
  Object.entries(byCpv).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => {
    console.log(`     ${c}: ${n}`);
  });

  console.log(`\n3) Upserting providers + contracts to Supabase`);
  let providerCount = 0, contractCount = 0, skipped = 0;
  for (const r of matches) {
    const supplier = (r["Awarded Suppliers"] || "").trim();
    if (!supplier || supplier === "NULL") { skipped++; continue; }
    // Some rows have multiple suppliers joined by "; " or "|"
    const suppliers = supplier.split(/\s*[;|]\s*/).filter(Boolean);

    const buyer     = r["Contracting Authority"] || r["Name of Client Contracting Authority"] || "";
    const title     = r["Tender/Contract Name"] || "";
    const value     = normValue(r["Awarded Value (€)"]) ?? normValue(r["Notice Estimated Value (€)"]);
    const awardDate = normDate(r["Award Published"]) || normDate(r["Notice Published Date/Contract Created Date"]);
    const tenderId  = r["Tender ID"] || "";
    const cpvDesc   = r["Main Cpv Code Description"] || "";
    const { la, region } = classifyLA(`${buyer} ${title}`);

    for (const sup of suppliers) {
      const pid = await upsertProvider(sup, { la, region, date: awardDate, value });
      if (!pid) continue;
      providerCount++;

      if (value && value >= 5000) {
        await insertContract({
          provider_id: pid,
          provider_name_raw: sup,
          awarding_body: buyer,
          local_authority: la,
          region,
          contract_title: title.slice(0, 500),
          value_eur: value,
          award_date: awardDate,
          source_type: "ocds_ie",
          source_url: `https://www.etenders.gov.ie/epps/cft/viewContractDetails.do?contractId=${tenderId}`,
          source_reference: `ocds_${tenderId}_${sup.slice(0, 40).replace(/\s+/g, "_")}`.slice(0, 200),
          description: cpvDesc.slice(0, 500),
        });
        contractCount++;
      }
    }
  }

  // ── Recalculate revenue from actual contracts (idempotent) ──
  console.log(`\n4) Recalculating provider revenue from contracts`);
  const { data: allProviders } = await supabase
    .from("emergency_providers")
    .select("id, name");
  let revenueFixed = 0;
  for (const p of (allProviders || [])) {
    const { data: contracts } = await supabase
      .from("provider_contracts")
      .select("value_eur")
      .eq("provider_id", p.id);
    const total = (contracts || []).reduce((s, c) => s + (c.value_eur || 0), 0);
    const { error: upErr } = await supabase
      .from("emergency_providers")
      .update({
        total_known_revenue_eur: total,
        source_count: (contracts || []).length,
      })
      .eq("id", p.id);
    if (!upErr && total > 0) revenueFixed++;
  }
  console.log(`   ${revenueFixed} providers with recalculated revenue`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Summary`);
  console.log(`   Rows in CSV:           ${rows.length}`);
  console.log(`   Accommodation matches: ${matches.length}`);
  console.log(`   Skipped (no supplier): ${skipped}`);
  console.log(`   Providers touched:     ${providerCount}`);
  console.log(`   Contracts recorded:    ${contractCount}`);
  console.log(`   Revenue recalculated:  ${revenueFixed}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

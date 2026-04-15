#!/usr/bin/env node
/**
 * fetch_homelessness_data.cjs
 * ============================================================
 * OpenBenefacts — Emergency Accommodation Data Pipeline
 * ============================================================
 * Fetches DHLGH monthly Homelessness Report CSVs from
 * opendata.housing.gov.ie via the data.gov.ie CKAN API.
 *
 * NOTE: DHLGH only publishes figures at REGIONAL level (9 regions).
 * There is no machine-readable LA-level monthly data. This script
 * takes the published regional totals and apportions them to each
 * local authority using the Feb 2025 seed weights (each LA's share
 * of its region's households in the seed snapshot).
 *
 * This means:
 *  - REGIONAL totals in the UI are exact published figures
 *  - LA-level figures are proportional estimates (clearly labelled)
 *
 * Run:  node scripts/fetch_homelessness_data.cjs
 * ============================================================
 */

"use strict";

const https = require("https");
const http  = require("http");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ─── Supabase client ─────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL / SUPABASE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Cost rates (€/household/week) ───────────────────────────
// PEA ~€130/night × 7 = €910 (but per-household avg 1.4 adults) ≈ €1,300
// STA ~€90/night × 7 = €630 (per-household avg 1.3 adults) ≈ €820
// TEA ~€70/night × 7 = €490 (per-household avg 1.8 adults) ≈ €880
const RATE_PEA = 1300;
const RATE_STA = 820;
const RATE_TEA = 880;

// ─── Region name normalisation ───────────────────────────────
// CSV uses "Dublin"; seed DB uses "Dublin Region". Map both ways.
const CSV_TO_DB_REGION = {
  "Dublin":      "Dublin Region",
  "Mid-East":    "Mid-East",
  "Midlands":    "Midlands",
  "Mid-West":    "Mid-West",
  "South-East":  "South-East",
  "South-West":  "South",       // DHLGH uses "South-West" for what we call "South"
  "South":       "South",
  "West":        "West",
  "Border":      "Border",
  "North-West":  "North-West",
  "North East":  "Border",
  "North-East":  "Border",
};

// ─── CKAN API helpers ─────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

async function searchHomelessnessPackages() {
  const url = "https://data.gov.ie/api/3/action/package_search?q=homelessness+report&rows=30&sort=metadata_modified+desc";
  const { body } = await fetchUrl(url);
  return JSON.parse(body).result?.results || [];
}

// ─── CSV parser ──────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

// ─── Extract report date from resource name/URL ──────────────
function extractReportDate(name = "", url = "") {
  const text = `${name} ${url}`.toLowerCase();
  const months = {
    january: "01", february: "02", febuary: "02",  // DHLGH has typos in filenames!
    march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09",
    october: "10", november: "11", december: "12",
  };
  for (const [m, num] of Object.entries(months)) {
    const match = text.match(new RegExp(`${m}[-\\s]+(20\\d{2})`));
    if (match) return `${match[1]}-${num}-01`;
  }
  const iso = text.match(/(20\d{2})[-_]?(0[1-9]|1[0-2])/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  return null;
}

// ─── Load seed weights from Supabase (Feb 2025 baseline) ─────
async function loadSeedWeights() {
  const { data, error } = await supabase
    .from("emergency_accommodation")
    .select("local_authority, region, pea_households, sta_households, tea_households, total_households, pea_adults, sta_adults, tea_adults, total_adults, total_children, total_persons")
    .eq("report_date", "2025-02-01");

  if (error) throw error;
  if (!data?.length) throw new Error("No Feb 2025 seed found — run the migration SQL first");

  // Group by region and compute each LA's share
  const byRegion = {};
  for (const la of data) {
    if (!byRegion[la.region]) byRegion[la.region] = { total: 0, las: [] };
    byRegion[la.region].total += la.total_households;
    byRegion[la.region].las.push(la);
  }

  // Each LA gets { weight: share, ...seedRow }
  const weights = [];
  for (const [region, g] of Object.entries(byRegion)) {
    for (const la of g.las) {
      weights.push({
        ...la,
        region,
        weight: g.total > 0 ? la.total_households / g.total : 0,
      });
    }
  }
  return weights;
}

// ─── Parse regional CSV row into structured figures ──────────
function normaliseRegionalRow(csvRow) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = csvRow[k];
      if (v !== undefined && v !== "") return parseInt(v, 10) || 0;
    }
    return 0;
  };

  const rawRegion = (csvRow["Region"] || "").trim();
  const dbRegion  = CSV_TO_DB_REGION[rawRegion];
  if (!dbRegion) return null;

  const totalAdults = get("Total Adults");
  const peaAdults   = get("Number of people who accessed Private Emergency Accommodation");
  const staAdults   = get("Number of people who accessed Supported Temporary Accommodation");
  const teaAdults   = get("Number of people who accessed Temporary Emergency Accommodation");
  const othAdults   = get("Number of people who accessed Other Accommodation");
  const numFams     = get("Number of Families");
  const adultsInFams = get("Number of Adults in Families");
  const dependants  = get("Number of Dependants in Families");

  // Single-adult households = adults who are NOT in families
  const singleAdultHH = Math.max(0, totalAdults - adultsInFams);
  const totalHH = singleAdultHH + numFams;

  // Estimate children split by type — distribute dependants proportionally to
  // where the adults in families are (assume families track adult distribution)
  const childRatio = totalAdults > 0 ? dependants / totalAdults : 0;

  return {
    region: dbRegion,
    totalAdults, totalChildren: dependants, totalPersons: totalAdults + dependants,
    totalHouseholds: totalHH,
    peaAdults, staAdults, teaAdults, othAdults,
    peaChildren: Math.round(peaAdults * childRatio),
    staChildren: Math.round(staAdults * childRatio),
    teaChildren: Math.round(teaAdults * childRatio),
    // Household split by type: proportional to adult split
    peaHH: totalAdults > 0 ? Math.round(totalHH * (peaAdults / totalAdults)) : 0,
    staHH: totalAdults > 0 ? Math.round(totalHH * (staAdults / totalAdults)) : 0,
    teaHH: totalAdults > 0 ? Math.round(totalHH * (teaAdults / totalAdults)) : 0,
    othHH: totalAdults > 0 ? Math.round(totalHH * (othAdults / totalAdults)) : 0,
  };
}

// ─── Apportion regional totals to LAs ────────────────────────
function apportionToLAs(regionData, weightsForRegion, reportDate) {
  const rows = [];
  for (const la of weightsForRegion) {
    const w = la.weight;
    if (w <= 0) continue;

    const peaHH = Math.round(regionData.peaHH * w);
    const staHH = Math.round(regionData.staHH * w);
    const teaHH = Math.round(regionData.teaHH * w);
    const othHH = Math.round(regionData.othHH * w);
    const peaAd = Math.round(regionData.peaAdults * w);
    const staAd = Math.round(regionData.staAdults * w);
    const teaAd = Math.round(regionData.teaAdults * w);
    const othAd = Math.round(regionData.othAdults * w);
    const peaCh = Math.round(regionData.peaChildren * w);
    const staCh = Math.round(regionData.staChildren * w);
    const teaCh = Math.round(regionData.teaChildren * w);

    rows.push({
      report_date: reportDate,
      local_authority: la.local_authority,
      region: la.region,
      pea_households: peaHH, pea_adults: peaAd, pea_children: peaCh,
      sta_households: staHH, sta_adults: staAd, sta_children: staCh,
      tea_households: teaHH, tea_adults: teaAd, tea_children: teaCh,
      other_households: othHH, other_adults: othAd, other_children: 0,
      total_households: peaHH + staHH + teaHH + othHH,
      total_adults:     peaAd + staAd + teaAd + othAd,
      total_children:   peaCh + staCh + teaCh,
      total_persons:    peaAd + staAd + teaAd + othAd + peaCh + staCh + teaCh,
      estimated_weekly_cost_eur: (peaHH * RATE_PEA) + (staHH * RATE_STA) + (teaHH * RATE_TEA),
      data_source: "DHLGH regional CSV (apportioned to LA via Feb 2025 weights)",
    });
  }
  return rows;
}

// ─── Upsert to Supabase ───────────────────────────────────────
async function upsertRows(rows) {
  if (!rows.length) { console.log("       No rows to upsert."); return 0; }
  const { error } = await supabase
    .from("emergency_accommodation")
    .upsert(rows, { onConflict: "report_date,local_authority" });
  if (error) throw error;
  return rows.length;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log("\n🏠 OpenBenefacts — Emergency Accommodation Data Pipeline");
  console.log("=".repeat(60));

  // 1. Load seed weights
  console.log("\n⚖️  Loading Feb 2025 seed weights from Supabase…");
  const weights = await loadSeedWeights();
  console.log(`   ✅ Loaded ${weights.length} LA weights across ${new Set(weights.map(w => w.region)).size} regions`);

  const weightsByRegion = {};
  for (const w of weights) {
    if (!weightsByRegion[w.region]) weightsByRegion[w.region] = [];
    weightsByRegion[w.region].push(w);
  }

  // 2. Find all homelessness CSV resources
  console.log("\n📡 Searching data.gov.ie for homelessness datasets…");
  const packages = await searchHomelessnessPackages();
  const resources = [];
  for (const pkg of packages) {
    for (const r of (pkg.resources || [])) {
      if (r.format?.toLowerCase() !== "csv") continue;
      if (!r.url?.toLowerCase().includes("homelessness")) continue;
      resources.push({ ...r, packageTitle: pkg.title });
    }
  }
  console.log(`   Found ${resources.length} CSV resources`);

  if (!resources.length) {
    console.log("\n⚠️  No CSVs found — DHLGH may have changed the publication slug.");
    return;
  }

  // 3. Process each CSV
  let totalUpserted = 0;
  const skipDate = "2025-02-01"; // don't overwrite seed
  const processedDates = new Set();

  for (const res of resources) {
    const reportDate = extractReportDate(res.name, res.url);
    if (!reportDate) { console.log(`\n   ⚠️  Skip (no date): ${res.name}`); continue; }
    if (processedDates.has(reportDate)) continue; // dedupe
    processedDates.add(reportDate);

    console.log(`\n📥 ${res.name || reportDate}`);
    console.log(`   date: ${reportDate}${reportDate === skipDate ? " (SKIP — preserves exact seed)" : ""}`);

    if (reportDate === skipDate) continue;

    try {
      const { status, body } = await fetchUrl(res.url);
      if (status !== 200) { console.warn(`   ⚠️  HTTP ${status}`); continue; }

      const csvRows = parseCsv(body);
      console.log(`   parsed ${csvRows.length} regional rows`);
      if (!csvRows.length) continue;

      // Normalise each regional row, then apportion to LAs
      let laRowsForDate = [];
      for (const csvRow of csvRows) {
        const reg = normaliseRegionalRow(csvRow);
        if (!reg) { console.warn(`   ⚠️  Unmapped region: "${csvRow.Region}"`); continue; }
        const laRows = apportionToLAs(reg, weightsByRegion[reg.region] || [], reportDate);
        laRowsForDate.push(...laRows);
      }

      console.log(`   apportioned → ${laRowsForDate.length} LA rows`);
      const n = await upsertRows(laRowsForDate);
      console.log(`   ✅ upserted ${n}`);
      totalUpserted += n;
    } catch (e) {
      console.error(`   ❌ ${e.message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Done. Total rows upserted: ${totalUpserted}`);
  console.log(`   Months processed: ${processedDates.size - (processedDates.has(skipDate) ? 1 : 0)}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

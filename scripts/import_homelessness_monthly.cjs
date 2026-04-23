#!/usr/bin/env node
/**
 * import_homelessness_monthly.cjs
 * ============================================================
 * Downloads the official monthly homelessness reports from
 * data.gov.ie / DHLGH and imports into the emergency_accommodation
 * Supabase table.
 *
 * These CSVs contain the official monthly headcount of persons
 * in emergency accommodation, broken down by local authority,
 * household type (adults, dependants, families), and accommodation
 * type (PEA, STA, TEA).
 *
 * Source:
 *   https://data.gov.ie/dataset?q=homelessness+report
 *   https://www.gov.ie/en/department-of-housing-local-government-and-heritage/collections/homelessness-data/
 *
 * Requires: npm install dotenv @supabase/supabase-js
 * Run:      node scripts/import_homelessness_monthly.cjs
 * ============================================================
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const https = require("https");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE creds in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "..", "data", "homelessness_monthly");

// ─── Known CSV download URLs from data.gov.ie ────────────────
// The DHLGH publishes monthly homelessness reports as CSVs.
// These are the direct resource download links.
// Update this list as new months are published.
const MONTHLY_REPORTS = [
  { month: "2025-01", url: "https://data.gov.ie/dataset/homelessness-report-january-2025" },
  { month: "2025-02", url: "https://data.gov.ie/dataset/homelessness-report-february-2025" },
  { month: "2025-03", url: "https://data.gov.ie/dataset/homelessness-report-march-2025" },
  { month: "2025-04", url: "https://data.gov.ie/dataset/homelessness-report-april-2025" },
  { month: "2025-05", url: "https://data.gov.ie/dataset/homelessness-report-may-2025" },
  { month: "2025-06", url: "https://data.gov.ie/dataset/homelessness-report-june-2025" },
  { month: "2025-07", url: "https://data.gov.ie/dataset/homelessness-report-july-2025" },
  { month: "2025-08", url: "https://data.gov.ie/dataset/homelessness-report-august-2025" },
  { month: "2025-09", url: "https://data.gov.ie/dataset/homelessness-report-september-2025" },
  { month: "2025-10", url: "https://data.gov.ie/dataset/homelessness-report-october-2025" },
  { month: "2025-11", url: "https://data.gov.ie/dataset/homelessness-report-november-2025" },
  { month: "2025-12", url: "https://data.gov.ie/dataset/homelessness-report-december-2025" },
  { month: "2026-01", url: "https://data.gov.ie/dataset/homelessness-report-january-2026" },
  { month: "2026-02", url: "https://data.gov.ie/dataset/homelessness-report-february-2026" },
  { month: "2026-03", url: "https://data.gov.ie/dataset/homelessness-report-march-2026" },
];

// ─── Region mapping ──────────────────────────────────────────
const REGION_MAP = {
  "Dublin":         "Dublin Region",
  "Dublin Region":  "Dublin Region",
  "Mid-East":       "Mid-East",
  "Midlands":       "Midlands",
  "Mid-West":       "Mid-West",
  "South-East":     "South-East",
  "South-West":     "South",
  "South":          "South",
  "West":           "West",
  "North-East":     "Border",
  "North-West":     "North-West",
  "Border":         "Border",
};

// ─── Download helper ─────────────────────────────────────────
function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "OpenBenefacts research bot (team@openbenefacts.ie)" },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ─── Parse CSV ───────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ""; });
    rows.push(row);
  }
  return rows;
}

// ─── Fetch CSV resource from data.gov.ie dataset page ────────
// data.gov.ie dataset pages link to the actual CSV resource.
// We need to find the CSV download URL from the dataset page.
async function fetchCSVFromDataset(datasetUrl) {
  try {
    const html = await download(datasetUrl);
    // Look for CSV resource links
    const csvMatch = html.match(/href="([^"]*\.csv[^"]*)"/i) ||
                     html.match(/href="(https:\/\/opendata\.housing\.gov\.ie[^"]*)"/i) ||
                     html.match(/href="([^"]*resource[^"]*download[^"]*)"/i);
    if (csvMatch) {
      let csvUrl = csvMatch[1];
      if (!csvUrl.startsWith("http")) csvUrl = `https://data.gov.ie${csvUrl}`;
      return await download(csvUrl);
    }

    // Try the CKAN API to get resource URLs
    const slug = datasetUrl.split("/dataset/").pop();
    const apiUrl = `https://data.gov.ie/api/3/action/package_show?id=${slug}`;
    const apiResp = await download(apiUrl);
    const apiData = JSON.parse(apiResp);
    if (apiData.result?.resources) {
      for (const r of apiData.result.resources) {
        if (r.format === "CSV" && r.url) {
          return await download(r.url);
        }
      }
    }
    throw new Error("No CSV resource found on dataset page");
  } catch (e) {
    throw new Error(`Failed to fetch CSV: ${e.message}`);
  }
}

// ─── Upsert emergency accommodation row ──────────────────────
async function upsertRow(row, reportMonth) {
  const la = row["Local Authority"] || row["local_authority"] || row["LA"] || "";
  if (!la || la.length < 3) return "skipped";

  const region = REGION_MAP[row["Region"] || row["region"] || ""] || "Other";

  const peaHH  = parseInt(row["PEA Households"]  || row["pea_households"]  || "0") || 0;
  const staHH  = parseInt(row["STA Households"]  || row["sta_households"]  || "0") || 0;
  const teaHH  = parseInt(row["TEA Households"]  || row["tea_households"]  || "0") || 0;
  const totalHH = parseInt(row["Total Households"] || row["total_households"] || "0") || (peaHH + staHH + teaHH);
  const totalPersons = parseInt(row["Total Persons"] || row["total_persons"] || row["Persons"] || "0") || 0;

  if (totalPersons === 0 && totalHH === 0) return "skipped";

  // Check for existing record
  const { data: existing } = await supabase
    .from("emergency_accommodation")
    .select("id")
    .eq("local_authority", la)
    .eq("report_month", reportMonth)
    .maybeSingle();

  if (existing) {
    // Update
    await supabase.from("emergency_accommodation").update({
      region,
      pea_households: peaHH,
      sta_households: staHH,
      tea_households: teaHH,
      total_households: totalHH,
      total_persons: totalPersons,
    }).eq("id", existing.id);
    return "updated";
  }

  // Insert
  const { error } = await supabase.from("emergency_accommodation").insert({
    local_authority: la,
    region,
    report_month: reportMonth,
    pea_households: peaHH,
    sta_households: staHH,
    tea_households: teaHH,
    total_households: totalHH,
    total_persons: totalPersons,
  });

  if (error) {
    console.log(`   ⚠ Insert failed for ${la}: ${error.message}`);
    return "error";
  }
  return "inserted";
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log("\n📊 OpenBenefacts — Monthly Homelessness Data Importer");
  console.log("=".repeat(60));

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

  for (const report of MONTHLY_REPORTS) {
    console.log(`\n📥 ${report.month}`);

    const cacheFile = path.join(DATA_DIR, `homelessness-${report.month}.csv`);

    let csvText;
    if (fs.existsSync(cacheFile)) {
      console.log("   📁 Using cached CSV");
      csvText = fs.readFileSync(cacheFile, "utf-8");
    } else {
      try {
        console.log(`   ⬇ Fetching from data.gov.ie...`);
        csvText = await fetchCSVFromDataset(report.url);
        fs.writeFileSync(cacheFile, csvText);
        console.log(`   ✓ Saved (${csvText.length} bytes)`);
      } catch (e) {
        console.log(`   ✗ ${e.message}`);
        totalErrors++;
        continue;
      }
    }

    const rows = parseCSV(csvText);
    console.log(`   📄 ${rows.length} rows`);

    for (const row of rows) {
      const result = await upsertRow(row, report.month);
      if (result === "inserted") totalInserted++;
      else if (result === "updated") totalUpdated++;
      else if (result === "error") totalErrors++;
      else totalSkipped++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 Homelessness Data Import Summary");
  console.log(`   Inserted:  ${totalInserted}`);
  console.log(`   Updated:   ${totalUpdated}`);
  console.log(`   Skipped:   ${totalSkipped}`);
  console.log(`   Errors:    ${totalErrors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

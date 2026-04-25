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
const http  = require("http");
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

// Rate limiting — data.gov.ie returns 429 if you hit it too fast
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DELAY_MS = 8000; // 8 seconds between requests (data.gov.ie is aggressive with 429s)

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
  const client = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    client.get(url, {
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
// The data.gov.ie CSVs provide REGIONAL aggregates with these columns:
//   Region, Total Adults, Male Adults, Female Adults,
//   Adults Aged 18-24, Adults Aged 25-44, Adults Aged 45-64, Adults Aged 65+,
//   Number of people who accessed Private Emergency Accommodation (PEA persons),
//   Number of people who accessed Supported Temporary Accommodation (STA persons),
//   Number of people who accessed Temporary Emergency Accommodation (TEA persons),
//   Number of people who accessed Other Accommodation,
//   Number of people with citizenship Irish/EEA/Non-EEA,
//   Number of Families (≈ households), Number of Adults in Families,
//   Number of Single-Parent families, Number of Dependants in Families (≈ children)
//
// We map region → local_authority (using "{Region} (Regional)" label),
// and store person-level counts where the table expects household counts.
// The table's unique key is (report_date, local_authority).

async function upsertRow(row, reportMonth) {
  const regionRaw = row["Region"] || "";
  if (!regionRaw || regionRaw.length < 3) return "skipped";

  const region = REGION_MAP[regionRaw] || regionRaw;
  // Use region as local_authority since data.gov.ie only publishes regional aggregates
  const localAuthority = `${region} (Regional)`;

  const int = (v) => parseInt(v || "0") || 0;

  const totalAdults    = int(row["Total Adults"]);
  const peaPersons     = int(row["Number of people who accessed Private Emergency Accommodation"]);
  const staPersons     = int(row["Number of people who accessed Supported Temporary Accommodation"]);
  const teaPersons     = int(row["Number of people who accessed Temporary Emergency Accommodation"]);
  const otherPersons   = int(row["Number of people who accessed Other Accommodation"]);
  const numFamilies    = int(row["Number of Families"]);
  const dependants     = int(row["Number of Dependants in Families"]);
  const totalPersons   = totalAdults + dependants;

  if (totalPersons === 0) return "skipped";

  // report_date is first of the month
  const reportDate = `${reportMonth}-01`;

  // Estimate weekly cost: PEA €130/night, STA €90/night, TEA €70/night
  // Use person-level estimates: PEA ~€93/person/night, STA ~€69/person/night, TEA ~€49/person/night
  const estWeeklyCost = Math.round(
    (peaPersons * 93 + staPersons * 69 + teaPersons * 49) * 7
  );

  const record = {
    report_date: reportDate,
    local_authority: localAuthority,
    region,
    pea_adults: peaPersons,       // CSV gives person counts, not split adults/children
    pea_households: 0,            // Not available at regional level
    pea_children: 0,
    sta_adults: staPersons,
    sta_households: 0,
    sta_children: 0,
    tea_adults: teaPersons,
    tea_households: 0,
    tea_children: 0,
    other_adults: otherPersons,
    other_households: 0,
    other_children: 0,
    total_households: numFamilies, // "Number of Families" is closest proxy
    total_adults: totalAdults,
    total_children: dependants,
    total_persons: totalPersons,
    estimated_weekly_cost_eur: estWeeklyCost,
    data_source: "data.gov.ie / DHLGH Monthly Homelessness Report",
  };

  // Check for existing record
  const { data: existing } = await supabase
    .from("emergency_accommodation")
    .select("id")
    .eq("local_authority", localAuthority)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("emergency_accommodation")
      .update(record)
      .eq("id", existing.id);
    if (error) {
      console.log(`   ⚠ Update failed for ${region}: ${error.message}`);
      return "error";
    }
    return "updated";
  }

  const { error } = await supabase.from("emergency_accommodation").insert(record);
  if (error) {
    console.log(`   ⚠ Insert failed for ${region}: ${error.message}`);
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

  for (let ri = 0; ri < MONTHLY_REPORTS.length; ri++) {
    const report = MONTHLY_REPORTS[ri];
    console.log(`\n📥 ${report.month}`);

    const cacheFile = path.join(DATA_DIR, `homelessness-${report.month}.csv`);

    let csvText;
    if (fs.existsSync(cacheFile)) {
      console.log("   📁 Using cached CSV");
      csvText = fs.readFileSync(cacheFile, "utf-8");
    } else {
      try {
        // Rate limit: wait between requests to avoid 429
        if (ri > 0) {
          console.log(`   ⏳ Waiting ${DELAY_MS/1000}s (rate limit)...`);
          await sleep(DELAY_MS);
        }
        console.log(`   ⬇ Fetching from data.gov.ie...`);
        csvText = await fetchCSVFromDataset(report.url);
        fs.writeFileSync(cacheFile, csvText);
        console.log(`   ✓ Saved (${csvText.length} bytes)`);
      } catch (e) {
        console.log(`   ✗ ${e.message}`);
        totalErrors++;
        // If rate limited, wait longer before next attempt
        if (e.message.includes("429")) {
          console.log("   ⏳ Rate limited — waiting 20s...");
          await sleep(20000);
        }
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

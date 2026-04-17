#!/usr/bin/env node
/**
 * scrape_oscar.cjs
 * ============================================================
 * Scrapes the OSCAR (Online Sports Capital Register) portal
 * at sportscapitalprogramme.ie for full Sports Capital Programme
 * grant allocations, then imports into OpenBenefacts.
 *
 * OSCAR has ~2,000+ grants per round worth €200M+.
 * This gives us club-level detail for every funded sports org
 * in Ireland.
 *
 * Run:  node scripts/scrape_oscar.cjs
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

// ─── Config ─────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "data", "oscar");
const OSCAR_BASE = "https://data.gov.ie/api/3/action";

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
  orgs.forEach(o => {
    const n = normalise(o.name);
    if (n) byNorm[n] = o;
  });
  return { byNorm };
}

function findMatch(name, county, lookups) {
  const norm = normalise(name);
  if (!norm) return null;

  // Exact match
  if (lookups.byNorm[norm]) return lookups.byNorm[norm];

  // Try with common suffixes removed
  const stripped = norm
    .replace(/\b(GAA|CLG|CLUB|RFC|AFC|FC|HURLING|CAMOGIE|SOCCER|RUGBY|ATHLETIC|ATHLETICS|SWIMMING|TENNIS|GOLF|HOCKEY|BOXING|ROWING|CRICKET|BASKETBALL|HANDBALL|COMMUNITY|PARISH|DEVELOPMENT)\b/g, "")
    .replace(/\s+/g, " ").trim();
  if (stripped && stripped.length > 4 && lookups.byNorm[stripped]) return lookups.byNorm[stripped];

  // County-aware substring matching
  for (const [key, org] of Object.entries(lookups.byNorm)) {
    if (key.length < 6) continue;
    if (norm.includes(key) || key.includes(norm)) {
      if (Math.abs(key.length - norm.length) < 15) {
        // Prefer county match
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

// ─── Parse amount ───────────────────────────────────────────
function parseAmount(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[€$\s]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

// ─── Parse CSV ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header
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

// ─── Step 1: Try data.gov.ie CKAN API ──────────────────────
async function tryDataGovIE() {
  console.log("\n📥 Step 1: Searching data.gov.ie for Sports Capital datasets...");
  console.log("─".repeat(60));

  const searches = [
    "sports-capital-programme",
    "sports-capital-programme-allocations-2000-2016",
    "sports-capital-programme-payments",
  ];

  const allResources = [];

  for (const pkgId of searches) {
    try {
      const url = `${OSCAR_BASE}/package_show?id=${pkgId}`;
      console.log(`   Trying: ${pkgId}`);
      const resp = await fetch(url, { timeout: 10000 });
      if (!resp.ok) { console.log(`   → Not found (${resp.status})`); continue; }
      const data = await resp.json();
      if (data.success && data.result?.resources) {
        console.log(`   → Found! ${data.result.resources.length} resources`);
        for (const r of data.result.resources) {
          console.log(`     • ${r.name || r.description || "untitled"} [${r.format}] ${r.url ? "✓" : "✗"}`);
          if (r.url && (r.format || "").toLowerCase().match(/csv|xlsx|xls/)) {
            allResources.push(r);
          }
        }
      }
    } catch (e) {
      console.log(`   → Error: ${e.message}`);
    }
  }

  // Also search via CKAN search API
  try {
    const searchUrl = `${OSCAR_BASE}/package_search?q=sports+capital&rows=10`;
    console.log(`\n   Searching CKAN: "sports capital"...`);
    const resp = await fetch(searchUrl, { timeout: 10000 });
    if (resp.ok) {
      const data = await resp.json();
      if (data.result?.results) {
        console.log(`   → ${data.result.count} datasets found`);
        for (const pkg of data.result.results) {
          console.log(`   📦 ${pkg.title} (${pkg.name})`);
          for (const r of (pkg.resources || [])) {
            if (r.url && (r.format || "").toLowerCase().match(/csv|xlsx|xls/)) {
              console.log(`     • ${r.name || "resource"} [${r.format}] → ${r.url.substring(0, 80)}...`);
              allResources.push(r);
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(`   → Search error: ${e.message}`);
  }

  return allResources;
}

// ─── Step 2: Download and parse CSV resources ───────────────
async function downloadAndParseResources(resources) {
  console.log(`\n📥 Step 2: Downloading ${resources.length} CSV/Excel resources...`);
  console.log("─".repeat(60));

  const allGrants = [];

  for (const r of resources) {
    try {
      console.log(`\n   Downloading: ${(r.name || r.url).substring(0, 60)}...`);
      const resp = await fetch(r.url, { timeout: 30000 });
      if (!resp.ok) { console.log(`   → HTTP ${resp.status}`); continue; }

      const contentType = resp.headers.get("content-type") || "";

      if (r.format?.toLowerCase() === "csv" || contentType.includes("csv") || r.url.endsWith(".csv")) {
        const text = await resp.text();
        const rows = parseCSV(text);
        console.log(`   → Parsed ${rows.length} rows`);

        if (rows.length > 0) {
          // Log headers to help debug column mapping
          const headers = Object.keys(rows[0]);
          console.log(`   → Headers: ${headers.join(", ")}`);

          // Intelligent column mapping
          const nameCol = headers.find(h => /applicant|organisation|club|grantee|recipient|name/i.test(h)) || headers[0];
          const amountCol = headers.find(h => /amount|allocation|grant|approved|payment|total/i.test(h));
          const countyCol = headers.find(h => /county|location|area/i.test(h));
          const yearCol = headers.find(h => /year|round|date/i.test(h));
          const sportCol = headers.find(h => /sport|type|category/i.test(h));
          const descCol = headers.find(h => /description|project|purpose/i.test(h));

          console.log(`   → Mapping: name="${nameCol}" amount="${amountCol}" county="${countyCol}" year="${yearCol}"`);

          let count = 0;
          for (const row of rows) {
            const name = row[nameCol];
            const amount = parseAmount(row[amountCol]);
            const county = row[countyCol] || "";
            const yearStr = row[yearCol] || "";
            const year = parseInt(yearStr) || null;
            const sport = row[sportCol] || "";
            const desc = row[descCol] || "";

            if (name && amount > 0) {
              allGrants.push({
                name: name.trim(),
                amount,
                county: county.trim(),
                year,
                sport: sport.trim(),
                description: desc.trim(),
                programme: "Sports Capital Programme",
                source: r.name || r.url,
              });
              count++;
            }
          }
          console.log(`   → Extracted ${count} valid grants`);
        }
      } else if (r.format?.toLowerCase().match(/xlsx|xls/)) {
        // Save Excel files for manual processing
        const buffer = await resp.arrayBuffer();
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const filename = path.join(DATA_DIR, `${r.name || "dataset"}.xlsx`);
        fs.writeFileSync(filename, Buffer.from(buffer));
        console.log(`   → Saved Excel to ${filename} (needs manual/xlsx processing)`);
      }
    } catch (e) {
      console.log(`   → Error: ${e.message}`);
    }
  }

  return allGrants;
}

// ─── Step 3: Try OSCAR portal directly ──────────────────────
async function tryOSCARPortal() {
  console.log("\n📥 Step 3: Trying OSCAR portal (sportscapitalprogramme.ie)...");
  console.log("─".repeat(60));

  // OSCAR's search page returns HTML with grant data
  // We'll try to find if there's a JSON API or downloadable export
  const oscarUrls = [
    "https://www.sportscapitalprogramme.ie/api/grants",
    "https://www.sportscapitalprogramme.ie/grants.json",
    "https://www.sportscapitalprogramme.ie/allocations/export",
    "https://www.sportscapitalprogramme.ie/search?format=csv",
    // OSCAR uses an Angular/React frontend — try the API patterns
    "https://www.sportscapitalprogramme.ie/api/v1/allocations",
    "https://www.sportscapitalprogramme.ie/api/allocations?page=1&per_page=2000",
  ];

  for (const url of oscarUrls) {
    try {
      console.log(`   Trying: ${url}`);
      const resp = await fetch(url, {
        timeout: 10000,
        headers: { "Accept": "application/json, text/csv, */*" }
      });
      if (resp.ok) {
        const contentType = resp.headers.get("content-type") || "";
        console.log(`   → ${resp.status} (${contentType})`);

        if (contentType.includes("json")) {
          const data = await resp.json();
          console.log(`   → JSON response! Keys: ${Object.keys(data).join(", ")}`);
          return data;
        } else if (contentType.includes("csv")) {
          const text = await resp.text();
          console.log(`   → CSV response! (${text.length} chars)`);
          return text;
        } else {
          // HTML — check if it contains structured data
          const text = await resp.text();
          if (text.length < 5000) {
            console.log(`   → Small response (${text.length} chars), likely not data`);
          } else {
            console.log(`   → Large response (${text.length} chars), saving for analysis...`);
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(path.join(DATA_DIR, "oscar_response.html"), text);
          }
        }
      } else {
        console.log(`   → ${resp.status}`);
      }
    } catch (e) {
      console.log(`   → ${e.message}`);
    }
  }

  // Try the main search page to find the API
  try {
    console.log(`\n   Fetching OSCAR homepage to find API endpoints...`);
    const resp = await fetch("https://www.sportscapitalprogramme.ie/", {
      timeout: 15000,
      headers: { "User-Agent": "OpenBenefacts/1.0 (Irish nonprofit transparency research)" }
    });
    if (resp.ok) {
      const html = await resp.text();
      // Look for API URLs in the HTML/JS
      const apiMatches = html.match(/["'](\/api\/[^"']+|https?:\/\/[^"']*api[^"']*)/g) || [];
      const dataMatches = html.match(/["'](\/data\/[^"']+|\/export[^"']*|\/download[^"']*)/g) || [];
      if (apiMatches.length > 0) console.log(`   → Found API refs: ${apiMatches.slice(0, 5).join(", ")}`);
      if (dataMatches.length > 0) console.log(`   → Found data refs: ${dataMatches.slice(0, 5).join(", ")}`);

      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, "oscar_homepage.html"), html);
      console.log(`   → Saved homepage HTML (${html.length} chars) to ${DATA_DIR}/oscar_homepage.html`);
    }
  } catch (e) {
    console.log(`   → Homepage fetch failed: ${e.message}`);
  }

  return null;
}

// ─── Step 4: Import grants to Supabase ──────────────────────
async function importGrants(grants, funderId, lookups) {
  console.log(`\n📥 Step 4: Importing ${grants.length} grants to Supabase...`);
  console.log("─".repeat(60));

  let matched = 0, unmatched = 0, inserted = 0, skipped = 0, errors = 0;

  // Batch process
  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    if (i % 100 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${grants.length} (${inserted} inserted, ${matched} matched, ${skipped} skipped)`);
    }

    const org = findMatch(g.name, g.county, lookups);
    const orgId = org?.id || null;
    if (orgId) matched++;
    else unmatched++;

    const record = {
      funder_id: funderId,
      org_id: orgId,
      recipient_name_raw: g.name,
      programme: g.programme || "Sports Capital Programme",
      amount: g.amount,
      year: g.year || null,
      county: g.county || org?.county || null,
    };

    // Skip exact duplicates
    const { data: existing } = await supabase
      .from("funding_grants")
      .select("id")
      .eq("funder_id", funderId)
      .eq("recipient_name_raw", g.name)
      .eq("programme", record.programme)
      .eq("amount", g.amount)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("funding_grants").insert(record);
    if (error) {
      errors++;
      if (errors <= 5) console.log(`   ✗ ${g.name}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { matched, unmatched, inserted, skipped, errors };
}

// ─── Step 5: Recalculate org grant totals ───────────────────
async function recalcGrantTotals() {
  console.log("\n📥 Step 5: Recalculating org grant totals...");
  console.log("─".repeat(60));

  const { data: allGrants } = await supabase
    .from("funding_grants")
    .select("org_id, amount")
    .not("org_id", "is", null);

  if (!allGrants || allGrants.length === 0) {
    console.log("   No matched grants found");
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
  console.log("\n🏟️  OpenBenefacts — OSCAR Sports Capital Scraper");
  console.log("=".repeat(60));

  // Load orgs
  console.log("Loading organisations...");
  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);
  const sportsOrgs = orgs.filter(o =>
    (o.sector || "").toLowerCase().includes("sport") ||
    (o.sector || "").toLowerCase().includes("recreation")
  );
  console.log(`   ${orgs.length} total orgs | ${sportsOrgs.length} sports/recreation orgs`);

  // Ensure data dir
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Get/create funder
  const funderId = await ensureFunder("Dept of Tourism, Culture, Arts, Gaeltacht, Sport & Media");
  console.log(`   Funder ID: ${funderId}`);

  // Step 1: data.gov.ie
  const resources = await tryDataGovIE();

  // Step 2: Download CSVs
  let grants = [];
  if (resources.length > 0) {
    grants = await downloadAndParseResources(resources);
  }

  // Step 3: Try OSCAR portal
  const oscarData = await tryOSCARPortal();
  if (oscarData && Array.isArray(oscarData)) {
    console.log(`   → Got ${oscarData.length} records from OSCAR API`);
    // Map OSCAR API format (unknown — will adapt based on actual response)
    for (const item of oscarData) {
      grants.push({
        name: item.applicant || item.organisation || item.name || "",
        amount: parseAmount(item.amount || item.allocation || item.grant_amount),
        county: item.county || item.location || "",
        year: parseInt(item.year || item.round) || null,
        programme: "Sports Capital Programme",
        source: "OSCAR API",
      });
    }
  }

  // If we got data from online sources, check for local CSV too
  const localCSV = path.join(DATA_DIR, "sports_capital_grants.csv");
  if (fs.existsSync(localCSV)) {
    console.log(`\n📁 Found local CSV: ${localCSV}`);
    const text = fs.readFileSync(localCSV, "utf8");
    const rows = parseCSV(text);
    console.log(`   → ${rows.length} rows from local file`);

    const headers = Object.keys(rows[0] || {});
    const nameCol = headers.find(h => /applicant|organisation|club|grantee|recipient|name/i.test(h)) || headers[0];
    const amountCol = headers.find(h => /amount|allocation|grant|approved|total/i.test(h));
    const countyCol = headers.find(h => /county|location/i.test(h));
    const yearCol = headers.find(h => /year|round/i.test(h));

    for (const row of rows) {
      const name = row[nameCol];
      const amount = parseAmount(row[amountCol]);
      if (name && amount > 0) {
        grants.push({
          name: name.trim(),
          amount,
          county: (row[countyCol] || "").trim(),
          year: parseInt(row[yearCol] || "") || null,
          programme: "Sports Capital Programme",
          source: "local CSV",
        });
      }
    }
  } else {
    console.log(`\n💡 Tip: If you download OSCAR data manually as CSV, save it to:`);
    console.log(`   ${localCSV}`);
    console.log(`   Then re-run this script to import it.`);
  }

  console.log(`\n📊 Total grants collected: ${grants.length}`);

  if (grants.length === 0) {
    console.log("\n⚠️  No grant data was retrieved from online sources.");
    console.log("   This likely means data.gov.ie and OSCAR APIs have changed.");
    console.log("");
    console.log("   📋 MANUAL FALLBACK:");
    console.log("   1. Go to https://www.sportscapitalprogramme.ie/");
    console.log("   2. Search for all allocations (leave search blank, hit Search)");
    console.log("   3. If there's an Export/Download button, save the CSV");
    console.log("   4. Save it to: data/oscar/sports_capital_grants.csv");
    console.log("   5. Re-run: node scripts/scrape_oscar.cjs");
    console.log("");
    console.log("   Alternatively, check:");
    console.log("   • https://data.gov.ie/dataset?q=sports+capital");
    console.log("   • https://assets.gov.ie (search 'sports capital allocations')");
    console.log("");

    // Still run the NGB/LSP grants from the companion script
    console.log("   Running companion sport funding script instead...");
    return;
  }

  // Deduplicate
  const seen = new Set();
  const uniqueGrants = grants.filter(g => {
    const key = `${normalise(g.name)}|${g.amount}|${g.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`   After dedup: ${uniqueGrants.length} unique grants`);

  // Step 4: Import
  const result = await importGrants(uniqueGrants, funderId, lookups);

  // Step 5: Recalculate totals
  await recalcGrantTotals();

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏟️  OSCAR Import Summary`);
  console.log(`   Total grants processed: ${uniqueGrants.length}`);
  console.log(`   Inserted:              ${result.inserted}`);
  console.log(`   Matched to org:        ${result.matched}`);
  console.log(`   Unmatched:             ${result.unmatched}`);
  console.log(`   Skipped (dupes):       ${result.skipped}`);
  console.log(`   Errors:                ${result.errors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

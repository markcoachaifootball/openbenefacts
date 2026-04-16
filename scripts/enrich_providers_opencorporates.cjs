#!/usr/bin/env node
/**
 * enrich_providers_opencorporates.cjs
 * ============================================================
 * For each provider in emergency_providers that lacks a CRO
 * number, search OpenCorporates for an Irish company match
 * and pull: directors, registered address, status, inc. date.
 *
 * OpenCorporates free tier: no key needed, ~200 req/day,
 * 5 requests/second rate limit.
 *
 * Run:  node scripts/enrich_providers_opencorporates.cjs
 * ============================================================
 */
"use strict";

const https = require("https");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Missing SUPABASE creds"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "OpenBenefacts research (contact@openbenefacts.com)",
        "Accept": "application/json",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Clean provider name for search — remove Ltd/CLG/DAC suffixes for broader match
function cleanForSearch(name) {
  return name
    .replace(/\b(Ltd\.?|Limited|CLG|DAC|Plc\.?|T\/A.*$|trading\s+as.*$)/gi, "")
    .replace(/[^\w\s&'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchCompany(name) {
  const q = encodeURIComponent(cleanForSearch(name));
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=ie&per_page=3`;
  const { status, json } = await fetchJson(url);
  if (status === 429) {
    console.warn("   ⏳ Rate limited — pausing 60s");
    await sleep(60000);
    return searchCompany(name);
  }
  if (status !== 200 || !json) return null;
  const results = json?.results?.companies || [];
  if (!results.length) return null;
  // Pick the best match — first result usually best for exact names
  return results[0].company;
}

async function getCompanyDetail(companyNumber) {
  const url = `https://api.opencorporates.com/v0.4/companies/ie/${companyNumber}`;
  const { status, json } = await fetchJson(url);
  if (status === 429) {
    console.warn("   ⏳ Rate limited — pausing 60s");
    await sleep(60000);
    return getCompanyDetail(companyNumber);
  }
  if (status !== 200 || !json) return null;
  return json?.results?.company || null;
}

async function main() {
  console.log("\n🔎 OpenBenefacts — Provider enrichment via OpenCorporates");
  console.log("=".repeat(60));

  // Get all providers that haven't been enriched yet
  const { data: providers, error } = await supabase
    .from("emergency_providers")
    .select("id, name, cro_number, enriched_at")
    .is("enriched_at", null)
    .order("total_known_revenue_eur", { ascending: false, nullsFirst: false });

  if (error) { console.error("❌", error.message); return; }
  console.log(`\n${providers.length} providers to enrich\n`);

  let enriched = 0, notFound = 0, errors = 0;
  for (const p of providers) {
    console.log(`\n[${enriched + notFound + errors + 1}/${providers.length}] ${p.name}`);

    // If we already have a CRO number, go straight to detail
    let company;
    if (p.cro_number) {
      console.log(`   CRO ${p.cro_number} (already known)`);
      company = await getCompanyDetail(p.cro_number);
    } else {
      // Search by name
      company = await searchCompany(p.name);
      if (!company) {
        console.log("   ✗ No match on OpenCorporates");
        // Mark as enriched (with no data) so we don't retry forever
        await supabase.from("emergency_providers")
          .update({ enriched_at: new Date().toISOString() })
          .eq("id", p.id);
        notFound++;
        await sleep(1200); // rate limit: stay under 5/sec
        continue;
      }
      console.log(`   ✓ Found: ${company.name} (${company.company_number})`);
      // Fetch full detail for directors
      const full = await getCompanyDetail(company.company_number);
      if (full) company = full;
    }
    await sleep(1200);

    // Extract directors/officers
    const officers = (company.officers || []).map(o => {
      const off = o.officer || o;
      return {
        name: off.name || "",
        role: off.position || off.role || "Director",
        appointed: off.start_date || null,
        resigned: off.end_date || null,
      };
    }).filter(o => o.name);

    // Current directors only (no end_date)
    const currentDirectors = officers.filter(o => !o.resigned);

    const update = {
      cro_number: company.company_number || null,
      registered_address: company.registered_address_in_full || company.registered_address?.in_full || null,
      company_status: company.current_status || null,
      incorporation_date: company.incorporation_date || null,
      company_type: company.company_type || null,
      directors: JSON.stringify(currentDirectors),
      opencorporates_url: company.opencorporates_url || null,
      enriched_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("emergency_providers")
      .update(update)
      .eq("id", p.id);

    if (upErr) {
      console.warn(`   ! Update failed: ${upErr.message}`);
      errors++;
    } else {
      console.log(`   → ${currentDirectors.length} current directors, status="${update.company_status}"`);
      enriched++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Enrichment summary`);
  console.log(`   Enriched:    ${enriched}`);
  console.log(`   Not found:   ${notFound}`);
  console.log(`   Errors:      ${errors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

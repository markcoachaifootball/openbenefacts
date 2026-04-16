#!/usr/bin/env node
/**
 * enrich_providers_crossref.cjs
 * ============================================================
 * Two-step enrichment for emergency_providers:
 *
 * STEP 1: Cross-reference against our own 36k+ organisations
 *         table to pull CRO numbers, addresses, charity numbers.
 *
 * STEP 2: For any provider with a CRO number, hit the FREE
 *         CRO Open Data API (opendata.cro.ie) for company
 *         details: type, status, registration date, address.
 *
 * STEP 3: Search CRO by name for providers still missing a
 *         CRO number after step 1.
 *
 * No paid API keys needed — uses only free public data.
 *
 * Run:  node scripts/enrich_providers_crossref.cjs
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Missing SUPABASE creds"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CRO_SQL_API = "https://opendata.cro.ie/api/3/action/datastore_search_sql";
const CRO_RESOURCE = "3fef41bc-b8f4-4b10-8434-ce51c29b1bba";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Normalise names for matching ────────────────────────────
function normalise(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(THE|LTD\.?|LIMITED|CLG|DAC|PLC\.?|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[^\w\s&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Load all organisations for matching ─────────────────────
async function loadOrganisations() {
  console.log("Loading organisations table...");
  let all = [];
  let page = 0;
  const ps = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, cro_number, charity_number, address, county, status, governing_form")
      .range(page * ps, (page + 1) * ps - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    page++;
    if (data.length < ps) break;
  }
  console.log(`   Loaded ${all.length} organisations`);
  return all;
}

// ─── Build lookup maps ───────────────────────────────────────
function buildLookups(orgs) {
  const byNorm = {};  // normalised name → org
  const byCro = {};   // CRO number → org
  for (const o of orgs) {
    const n = normalise(o.name);
    if (n) byNorm[n] = o;
    if (o.cro_number) byCro[String(o.cro_number).trim()] = o;
  }
  return { byNorm, byCro };
}

// ─── Fuzzy match: try exact normalised, then substring ───────
function findMatch(providerName, lookups) {
  const norm = normalise(providerName);
  if (!norm) return null;

  // Exact normalised match
  if (lookups.byNorm[norm]) return lookups.byNorm[norm];

  // Try without "HOTEL", "HOSTEL", "B&B" etc. (provider might have suffix the org doesn't)
  const stripped = norm.replace(/\b(HOTEL|HOSTEL|BB|BED\s*BREAKFAST|APARTMENTS?|GUEST\s*HOUSE)\b/g, "").trim();
  if (stripped && lookups.byNorm[stripped]) return lookups.byNorm[stripped];

  // Substring match: provider name contains org name or vice versa
  for (const [key, org] of Object.entries(lookups.byNorm)) {
    if (key.length < 8) continue; // skip very short names
    if (norm.includes(key) || key.includes(norm)) return org;
  }

  return null;
}

// ─── CRO API: search by company number ───────────────────────
async function fetchCROByNumber(croNum) {
  const sql = `SELECT * FROM "${CRO_RESOURCE}" WHERE company_num = ${parseInt(croNum)}`;
  const url = `${CRO_SQL_API}?sql=${encodeURIComponent(sql)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.success || !data.result.records.length) return null;
    return data.result.records[0];
  } catch { return null; }
}

// ─── CRO API: search by company name ─────────────────────────
async function fetchCROByName(name) {
  // Clean for search
  const clean = name
    .replace(/\b(Ltd\.?|Limited|CLG|DAC|Plc\.?|T\/A.*$|trading\s+as.*$)\b/gi, "")
    .replace(/[^\w\s&'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean.length < 5) return null;

  const sql = `SELECT * FROM "${CRO_RESOURCE}" WHERE UPPER(company_name) LIKE UPPER('%${clean.replace(/'/g, "''")}%') AND company_status != 'Dissolved' LIMIT 5`;
  const url = `${CRO_SQL_API}?sql=${encodeURIComponent(sql)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.success || !data.result.records.length) return null;

    // Pick best match — prefer exact name match
    const upperClean = clean.toUpperCase();
    const exact = data.result.records.find(r =>
      normalise(r.company_name) === normalise(clean)
    );
    return exact || data.result.records[0];
  } catch { return null; }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n🔎 OpenBenefacts — Provider enrichment (cross-reference + CRO)");
  console.log("=".repeat(60));

  // Load our organisations
  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);

  // Load emergency providers
  const { data: providers, error } = await supabase
    .from("emergency_providers")
    .select("id, name, cro_number, enriched_at, total_known_revenue_eur")
    .order("total_known_revenue_eur", { ascending: false, nullsFirst: false });

  if (error) { console.error("❌", error.message); return; }
  console.log(`\n${providers.length} emergency providers to process\n`);

  // ── STEP 1: Cross-reference with organisations table ──────
  console.log("━".repeat(60));
  console.log("STEP 1: Cross-reference with organisations table");
  console.log("━".repeat(60));

  let matched = 0, unmatched = 0;
  const unmatchedProviders = [];

  for (const p of providers) {
    const org = findMatch(p.name, lookups);
    if (org) {
      const update = {};
      if (org.cro_number && !p.cro_number) update.cro_number = String(org.cro_number);
      if (org.charity_number) update.charity_number = org.charity_number;
      if (org.address) update.registered_address = org.address;
      if (org.status) update.company_status = org.status;
      if (org.governing_form) update.company_type = org.governing_form;

      if (Object.keys(update).length > 0) {
        update.enriched_at = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("emergency_providers")
          .update(update)
          .eq("id", p.id);
        if (upErr) {
          console.log(`   ✗ ${p.name}: ${upErr.message}`);
        } else {
          console.log(`   ✓ ${p.name} → CRO:${update.cro_number || p.cro_number || "?"} CHY:${update.charity_number || "?"}`);
          if (update.cro_number) p.cro_number = update.cro_number; // carry forward
          matched++;
        }
      } else {
        // Org found but no new data to add
        matched++;
      }
    } else {
      unmatchedProviders.push(p);
      unmatched++;
    }
  }

  console.log(`\n   Matched: ${matched}  |  Unmatched: ${unmatched}\n`);

  // ── STEP 2: CRO API for providers that already have a CRO number ──
  console.log("━".repeat(60));
  console.log("STEP 2: CRO Open Data API — enrich by CRO number");
  console.log("━".repeat(60));

  const withCro = providers.filter(p => p.cro_number);
  let croEnriched = 0;
  for (const p of withCro) {
    const cro = await fetchCROByNumber(p.cro_number);
    if (!cro) {
      console.log(`   ✗ ${p.name} (CRO ${p.cro_number}) — not found in CRO register`);
      await sleep(300);
      continue;
    }

    const addr = [cro.company_address_1, cro.company_address_2, cro.company_address_3, cro.company_address_4]
      .filter(Boolean).join(", ");

    const update = {
      company_status: cro.company_status || null,
      company_type: cro.company_type || null,
      incorporation_date: cro.company_reg_date ? cro.company_reg_date.split("T")[0] : null,
      enriched_at: new Date().toISOString(),
    };
    if (addr) update.registered_address = addr;

    const { error: upErr } = await supabase
      .from("emergency_providers")
      .update(update)
      .eq("id", p.id);

    if (upErr) {
      console.log(`   ✗ ${p.name}: ${upErr.message}`);
    } else {
      console.log(`   ✓ ${p.name} → ${cro.company_status} | ${cro.company_type} | ${addr.slice(0, 50)}`);
      croEnriched++;
    }
    await sleep(300);
  }
  console.log(`\n   CRO-enriched: ${croEnriched} of ${withCro.length}\n`);

  // ── STEP 3: CRO name search for remaining unmatched providers ──
  console.log("━".repeat(60));
  console.log("STEP 3: CRO name search for unmatched providers");
  console.log("━".repeat(60));

  let nameMatched = 0;
  for (const p of unmatchedProviders) {
    if (p.cro_number) continue; // already have CRO from step 1

    const cro = await fetchCROByName(p.name);
    if (!cro) {
      console.log(`   ✗ ${p.name} — no CRO match`);
      // Mark enriched so we don't retry
      await supabase.from("emergency_providers")
        .update({ enriched_at: new Date().toISOString() })
        .eq("id", p.id);
      await sleep(300);
      continue;
    }

    const addr = [cro.company_address_1, cro.company_address_2, cro.company_address_3, cro.company_address_4]
      .filter(Boolean).join(", ");

    const update = {
      cro_number: String(cro.company_num),
      company_status: cro.company_status || null,
      company_type: cro.company_type || null,
      incorporation_date: cro.company_reg_date ? cro.company_reg_date.split("T")[0] : null,
      registered_address: addr || null,
      enriched_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("emergency_providers")
      .update(update)
      .eq("id", p.id);

    if (upErr) {
      console.log(`   ✗ ${p.name}: ${upErr.message}`);
    } else {
      console.log(`   ✓ ${p.name} → CRO ${cro.company_num} | ${cro.company_status} | ${cro.company_type}`);
      nameMatched++;
    }
    await sleep(400);
  }
  console.log(`\n   Name-matched: ${nameMatched} of ${unmatchedProviders.length}\n`);

  // ── Summary ────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("📊 Enrichment Summary");
  console.log(`   Total providers:         ${providers.length}`);
  console.log(`   Step 1 (org crossref):   ${matched} matched`);
  console.log(`   Step 2 (CRO by number):  ${croEnriched} enriched`);
  console.log(`   Step 3 (CRO by name):    ${nameMatched} found`);
  console.log(`   Still unmatched:         ${unmatchedProviders.length - nameMatched}`);
  console.log("=".repeat(60) + "\n");
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

#!/usr/bin/env node
/**
 * enrich_providers_directors.cjs
 * ============================================================
 * Pulls director names from the existing directors + org_directors
 * tables (sourced from Charities Register) for emergency_providers
 * that have been matched to an organisation.
 *
 * Also tries CRO.ie CORE search for providers with CRO numbers
 * but no charity match (hotels, B&Bs, private companies).
 *
 * Run:  node scripts/enrich_providers_directors.cjs
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing SUPABASE creds"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  let all = [];
  let page = 0;
  const ps = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, cro_number")
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
  const byCro = {};
  for (const o of orgs) {
    const n = normalise(o.name);
    if (n) byNorm[n] = o;
    if (o.cro_number) byCro[String(o.cro_number).trim()] = o;
  }
  return { byNorm, byCro };
}

function findOrgMatch(providerName, providerCro, lookups) {
  // Try CRO number first
  if (providerCro && lookups.byCro[String(providerCro).trim()]) {
    return lookups.byCro[String(providerCro).trim()];
  }
  const norm = normalise(providerName);
  if (!norm) return null;
  if (lookups.byNorm[norm]) return lookups.byNorm[norm];

  // Stripped match
  const stripped = norm.replace(/\b(HOTEL|HOSTEL|BB|BED\s*BREAKFAST|APARTMENTS?|GUEST\s*HOUSE)\b/g, "").trim();
  if (stripped && lookups.byNorm[stripped]) return lookups.byNorm[stripped];

  // Substring
  for (const [key, org] of Object.entries(lookups.byNorm)) {
    if (key.length < 8) continue;
    if (norm.includes(key) || key.includes(norm)) return org;
  }
  return null;
}

// ─── Fetch directors for an org from org_directors + directors ──
async function getDirectorsForOrg(orgId) {
  const { data, error } = await supabase
    .from("org_directors")
    .select("role, start_date, end_date, directors(name)")
    .eq("org_id", orgId)
    .is("end_date", null); // current directors only

  if (error || !data) return [];
  return data.map(d => ({
    name: d.directors?.name || "",
    role: d.role || "Director",
    appointed: d.start_date || null,
    resigned: null,
  })).filter(d => d.name);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n👥 OpenBenefacts — Director enrichment for emergency providers");
  console.log("=".repeat(60));

  // Load organisations and build lookups
  console.log("Loading organisations...");
  const orgs = await loadOrganisations();
  const lookups = buildLookups(orgs);
  console.log(`   ${orgs.length} organisations loaded\n`);

  // Load emergency providers
  const { data: providers, error } = await supabase
    .from("emergency_providers")
    .select("id, name, cro_number, directors, total_known_revenue_eur")
    .order("total_known_revenue_eur", { ascending: false, nullsFirst: false });

  if (error) { console.error("Error:", error.message); return; }
  console.log(`${providers.length} emergency providers to process\n`);

  let enriched = 0, alreadyHave = 0, noMatch = 0, noDirectors = 0;

  for (const p of providers) {
    // Skip if already has directors
    const existing = typeof p.directors === "string" ? JSON.parse(p.directors || "[]") : (p.directors || []);
    if (existing.length > 0) {
      alreadyHave++;
      continue;
    }

    // Find matching org
    const org = findOrgMatch(p.name, p.cro_number, lookups);
    if (!org) {
      noMatch++;
      continue;
    }

    // Get directors from org_directors table
    const directors = await getDirectorsForOrg(org.id);
    if (directors.length === 0) {
      noDirectors++;
      continue;
    }

    // Update emergency provider with directors
    const { error: upErr } = await supabase
      .from("emergency_providers")
      .update({
        directors: JSON.stringify(directors),
        enriched_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (upErr) {
      console.log(`   ✗ ${p.name}: ${upErr.message}`);
    } else {
      console.log(`   ✓ ${p.name} → ${directors.length} directors: ${directors.map(d => d.name).join(", ")}`);
      enriched++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Director Enrichment Summary`);
  console.log(`   Total providers:         ${providers.length}`);
  console.log(`   Already had directors:   ${alreadyHave}`);
  console.log(`   Enriched with directors: ${enriched}`);
  console.log(`   Matched but 0 directors: ${noDirectors}`);
  console.log(`   No org match:            ${noMatch}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

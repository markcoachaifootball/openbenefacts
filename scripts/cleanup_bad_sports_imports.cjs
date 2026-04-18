#!/usr/bin/env node
/**
 * cleanup_bad_sports_imports.cjs
 * ============================================================
 * Finds and removes organisations that were incorrectly created
 * by the Sports Capital PDF importer. These are typically:
 *   - Government programme names (e.g. "Community Employment Programme")
 *   - Subtotal/header lines parsed as org names
 *   - Aggregate amounts assigned to non-club entities
 *
 * What it does:
 *   1. Scans all orgs in "Recreation, Sports" sector
 *   2. Flags those matching known bad patterns (programme names,
 *      government bodies, totals, etc.)
 *   3. Flags orgs with suspiciously large total grants (> €1M)
 *   4. In DRY RUN mode (default): reports what it would delete
 *   5. With --execute flag: actually deletes the bad data
 *
 * Run:   node scripts/cleanup_bad_sports_imports.cjs           (dry run)
 *        node scripts/cleanup_bad_sports_imports.cjs --execute  (live)
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ilkwspvhqedzjreysuxu.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXECUTE = process.argv.includes("--execute");

// ─── Patterns that are NOT sports clubs ────────────────────
// These are government programmes, schemes, headers, or other
// non-club text that the PDF parser mistakenly treated as org names.
const BAD_NAME_PATTERNS = [
  // Government programmes & schemes
  /\bprogramme\b/i,
  /\bscheme\b/i,
  /\binitiative\b/i,
  /\bfund\b(?!\s*raising)/i,   // "fund" but not "fundraising"
  /\bproject\b/i,
  /\ballocation[s]?\b/i,
  /\bpayment[s]?\b/i,
  /\bgrant[s]?\b/i,
  /\bsubvention\b/i,
  /\bcommunity employment\b/i,
  /\bjob[s]?\s*bridge/i,
  /\btus\b/i,                   // TÚS scheme
  /\brural social scheme\b/i,
  /\bcommunity services programme\b/i,

  // Government departments and bodies
  /\bdepartment\s+of\b/i,
  /\bministry\b/i,
  /\bgovernment\b/i,
  /\bexchequer\b/i,
  /\bstate\s+body\b/i,
  /\bnational\s+lottery\b/i,
  /\bpobal\b/i,
  /\bsport\s+ireland\b/i,

  // Header/total lines from PDFs
  /^total[s]?\b/i,
  /^sub[\s-]?total/i,
  /^grand\s+total/i,
  /^page\s+\d/i,
  /^appendix/i,
  /^table\s+\d/i,
  /^schedule/i,
  /^summary/i,
  /^continued/i,
  /^year\b/i,
  /^\d{4}$/,                    // Just a year number

  // Generic government/institutional terms unlikely to be a sports club
  /\blocal\s+authority\b/i,
  /\bcity\s+council\b/i,
  /\bcounty\s+council\b/i,
  /\btownland\b/i,
  /\bconstituency\b/i,
  /\belectoral\b/i,
  /\bparliament/i,
];

// Names to always delete (exact matches, case-insensitive)
const BAD_NAMES_EXACT = [
  "community employment programme",
  "sports capital programme",
  "sports capital and equipment programme",
  "community sport facilities fund",
  "equipment only programme",
  "large scale sport infrastructure fund",
  "dormant accounts fund",
  "capital programme",
  "current programme",
];

// ─── Helpers ───────────────────────────────────────────────
function isBadName(name) {
  if (!name) return true;
  const lower = name.toLowerCase().trim();

  // Exact match
  if (BAD_NAMES_EXACT.includes(lower)) return true;

  // Very short names are suspicious (likely parsing artifacts)
  if (lower.length < 5) return true;

  // Pattern match
  for (const pat of BAD_NAME_PATTERNS) {
    if (pat.test(lower)) return true;
  }

  // Names that are mostly numbers
  const digits = (lower.match(/\d/g) || []).length;
  if (digits > lower.length * 0.5) return true;

  return false;
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log("\n🧹 OpenBenefacts — Sports Import Cleanup");
  console.log("=".repeat(60));
  console.log(EXECUTE ? "⚡ LIVE MODE — changes will be applied!" : "🔍 DRY RUN — no changes will be made");
  console.log("");

  // ── Step 1: Load all "Recreation, Sports" orgs ──
  console.log("Loading sports-sector organisations...");
  let allSportsOrgs = [];
  let page = 0;
  const ps = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, sector, subsector, county, charity_number, cro_number")
      .eq("sector", "Recreation, Sports")
      .range(page * ps, (page + 1) * ps - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allSportsOrgs = allSportsOrgs.concat(data);
    page++;
    if (data.length < ps) break;
  }
  console.log(`   Found ${allSportsOrgs.length} orgs in "Recreation, Sports" sector\n`);

  // ── Step 2: Flag bad names ──
  const badNameOrgs = [];
  const okOrgs = [];

  for (const org of allSportsOrgs) {
    if (isBadName(org.name)) {
      badNameOrgs.push(org);
    } else {
      okOrgs.push(org);
    }
  }

  console.log(`🚩 ${badNameOrgs.length} orgs flagged by name pattern:`);
  console.log("─".repeat(60));
  for (const org of badNameOrgs) {
    console.log(`   ✗ "${org.name}" (id: ${org.id}, county: ${org.county || "none"})`);
  }

  // ── Step 3: Check for suspiciously large grant totals ──
  console.log(`\n🔎 Checking grant totals for remaining ${okOrgs.length} sports orgs...`);
  const suspiciousOrgs = [];

  // Check in batches
  for (let i = 0; i < okOrgs.length; i += 50) {
    const batch = okOrgs.slice(i, i + 50);
    const ids = batch.map(o => o.id);

    const { data: grants, error } = await supabase
      .from("funding_grants")
      .select("org_id, amount")
      .in("org_id", ids);

    if (error) {
      console.log(`   ✗ Error querying grants: ${error.message}`);
      continue;
    }

    // Sum per org
    const sums = {};
    for (const g of (grants || [])) {
      if (!g.org_id) continue;
      sums[g.org_id] = (sums[g.org_id] || 0) + (g.amount || 0);
    }

    for (const org of batch) {
      const total = sums[org.id] || 0;
      if (total > 1000000) { // > €1M is suspicious for a sports club
        suspiciousOrgs.push({ ...org, totalGrants: total });
      }
    }
  }

  if (suspiciousOrgs.length > 0) {
    console.log(`\n⚠️  ${suspiciousOrgs.length} orgs with suspiciously large grant totals (> €1M):`);
    console.log("─".repeat(60));
    suspiciousOrgs.sort((a, b) => b.totalGrants - a.totalGrants);
    for (const org of suspiciousOrgs) {
      const hasRegistration = org.charity_number || org.cro_number;
      const flag = hasRegistration ? "📋" : "🚩";
      console.log(`   ${flag} "${org.name}" — €${org.totalGrants.toLocaleString()} (id: ${org.id}${hasRegistration ? ", has registration" : ", NO registration"})`);
    }
    console.log(`\n   📋 = has charity/CRO number (likely real org, review manually)`);
    console.log(`   🚩 = no registration (likely bad import, will be deleted)`);
  }

  // Add unregistered suspicious orgs to the delete list
  const suspiciousToDelete = suspiciousOrgs.filter(o => !o.charity_number && !o.cro_number);

  // ── Step 4: Combine all orgs to delete ──
  const allToDelete = [...badNameOrgs, ...suspiciousToDelete];
  const uniqueToDelete = [...new Map(allToDelete.map(o => [o.id, o])).values()];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Cleanup Summary`);
  console.log(`   Flagged by name pattern:       ${badNameOrgs.length}`);
  console.log(`   Flagged by large grants (unreg): ${suspiciousToDelete.length}`);
  console.log(`   Total to delete:                ${uniqueToDelete.length}`);
  console.log(`${"=".repeat(60)}`);

  if (uniqueToDelete.length === 0) {
    console.log("\n✅ No bad records found. Database looks clean!");
    return;
  }

  if (!EXECUTE) {
    console.log("\n🔍 DRY RUN complete. Run with --execute to apply changes.");
    console.log("   node scripts/cleanup_bad_sports_imports.cjs --execute\n");
    return;
  }

  // ── Step 5: Delete grants and orgs ──
  console.log("\n⚡ Deleting bad records...");

  let grantsDeleted = 0;
  let orgsDeleted = 0;

  for (const org of uniqueToDelete) {
    // Delete associated grants first (foreign key)
    const { data: deletedGrants, error: gErr } = await supabase
      .from("funding_grants")
      .delete()
      .eq("org_id", org.id)
      .select("id");

    if (gErr) {
      console.log(`   ✗ Error deleting grants for "${org.name}": ${gErr.message}`);
      continue;
    }
    grantsDeleted += (deletedGrants || []).length;

    // Delete the organisation
    const { error: oErr } = await supabase
      .from("organisations")
      .delete()
      .eq("id", org.id);

    if (oErr) {
      console.log(`   ✗ Error deleting org "${org.name}": ${oErr.message}`);
    } else {
      orgsDeleted++;
      console.log(`   ✓ Deleted "${org.name}" + ${(deletedGrants || []).length} grants`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧹 Cleanup Complete`);
  console.log(`   Organisations deleted: ${orgsDeleted}`);
  console.log(`   Grants deleted:        ${grantsDeleted}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

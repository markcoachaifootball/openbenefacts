#!/usr/bin/env node
/**
 * cleanup_bad_provider_data.cjs
 * ============================================================
 * Removes the bad eTenders framework agreement data from
 * emergency_providers. These entries show shared multi-year
 * framework ceilings (€700M, €500M, €250M) as if they were
 * actual payments to individual providers. They are not.
 *
 * Also removes providers that are clearly not EA providers:
 *  - Construction companies
 *  - Architects and consultants
 *  - Marketing/PR firms
 *  - Individual sole traders
 *
 * Run:  node scripts/cleanup_bad_provider_data.cjs [--execute]
 * ============================================================
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE creds in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DRY_RUN = !process.argv.includes("--execute");

// Patterns for non-EA providers (architects, consultants, construction, etc.)
const NOT_EA_PATTERNS = [
  /architect/i, /consult/i, /surveyor/i, /engineer/i,
  /construction/i, /building\s*systems/i, /contracting/i,
  /design\s*(and|&)\s*build/i, /civils?\b/i,
  /marketing/i, /digital\b/i, /brand\b/i, /content\b/i,
  /\bPR\b/, /advertising/i, /communications/i,
  /accountant/i, /\bLLP\b/, /solicitor/i, /legal/i,
  /\bKPMG\b/i, /\bEY\b/, /ernst\s*(and|&)\s*young/i, /deloitte/i, /\bPwC\b/i,
  /\bArup\b/i, /\bAECOM\b/i,
  /sole\s*trader/i,
  /coláiste/i,  // Irish language colleges, not accommodation
  /planning\b/i, /infrastructure\b/i,
];

// Framework agreement values — these are shared ceilings, not actual spend
const FRAMEWORK_THRESHOLD = 50_000_000; // €50M+ is almost certainly a framework ceiling

async function main() {
  console.log(`\n🧹 OpenBenefacts — Provider Data Cleanup ${DRY_RUN ? "(DRY RUN)" : "⚡ EXECUTING"}`);
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("   Add --execute to actually delete. This is a preview.\n");
  }

  // Load all providers
  const { data: providers, error } = await supabase
    .from("emergency_providers")
    .select("id, name, total_known_revenue_eur, provider_type, local_authority")
    .order("total_known_revenue_eur", { ascending: false });

  if (error) throw error;
  console.log(`   ${providers.length} providers in database\n`);

  const toDelete = [];

  for (const p of providers) {
    const revenue = p.total_known_revenue_eur || 0;
    let reason = null;

    // Flag 1: Framework agreement ceiling values
    if (revenue >= FRAMEWORK_THRESHOLD) {
      reason = `Framework ceiling (${fmt(revenue)})`;
    }

    // Flag 2: Not an EA provider (wrong sector)
    if (!reason) {
      for (const re of NOT_EA_PATTERNS) {
        if (re.test(p.name)) {
          reason = `Not EA provider (${re.source})`;
          break;
        }
      }
    }

    if (reason) {
      toDelete.push({ id: p.id, name: p.name, revenue, reason });
    }
  }

  console.log(`\n🗑️  ${toDelete.length} providers to remove:\n`);
  for (const d of toDelete.slice(0, 40)) {
    console.log(`   ${d.name.padEnd(50)} ${fmt(d.revenue).padStart(10)}  ← ${d.reason}`);
  }
  if (toDelete.length > 40) {
    console.log(`   ... and ${toDelete.length - 40} more`);
  }

  const keeping = providers.length - toDelete.length;
  console.log(`\n   Keeping: ${keeping} providers`);
  console.log(`   Removing: ${toDelete.length} providers`);

  if (!DRY_RUN && toDelete.length > 0) {
    console.log("\n   Deleting contracts...");
    const ids = toDelete.map(d => d.id);

    // Delete contracts first (FK constraint)
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const { error: cErr } = await supabase
        .from("provider_contracts")
        .delete()
        .in("provider_id", batch);
      if (cErr) console.log(`   ⚠ Contract delete error: ${cErr.message}`);
    }

    console.log("   Deleting providers...");
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const { error: pErr } = await supabase
        .from("emergency_providers")
        .delete()
        .in("id", batch);
      if (pErr) console.log(`   ⚠ Provider delete error: ${pErr.message}`);
    }

    console.log(`   ✓ Deleted ${toDelete.length} providers and their contracts`);
  }

  console.log(`\n${"=".repeat(60)}\n`);
}

function fmt(n) {
  if (!n) return "€0";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${n}`;
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

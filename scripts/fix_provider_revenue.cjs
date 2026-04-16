#!/usr/bin/env node
/**
 * fix_provider_revenue.cjs
 * One-time fix: recalculate total_known_revenue_eur and source_count
 * from actual provider_contracts rows (not accumulated from re-runs).
 *
 * Run:  node scripts/fix_provider_revenue.cjs
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing SUPABASE creds"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("\nRecalculating provider revenue from contracts...\n");

  const { data: providers, error } = await supabase
    .from("emergency_providers")
    .select("id, name, total_known_revenue_eur");
  if (error) { console.error(error.message); return; }

  let fixed = 0, zeroed = 0;
  for (const p of providers) {
    const { data: contracts } = await supabase
      .from("provider_contracts")
      .select("value_eur")
      .eq("provider_id", p.id);

    const total = (contracts || []).reduce((s, c) => s + (c.value_eur || 0), 0);
    const count = (contracts || []).length;

    if (total !== p.total_known_revenue_eur || true) {
      await supabase.from("emergency_providers")
        .update({ total_known_revenue_eur: total, source_count: count })
        .eq("id", p.id);

      if (total !== p.total_known_revenue_eur) {
        const diff = (p.total_known_revenue_eur || 0) - total;
        if (diff > 0) {
          console.log(`  ${p.name}: €${(p.total_known_revenue_eur||0).toLocaleString()} → €${total.toLocaleString()} (was inflated by €${diff.toLocaleString()})`);
          fixed++;
        }
      }
      if (total === 0) zeroed++;
    }
  }

  console.log(`\nDone: ${fixed} inflated values fixed, ${zeroed} providers with no contracts (set to €0)`);
  console.log(`Total providers: ${providers.length}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

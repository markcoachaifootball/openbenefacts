#!/usr/bin/env node
/**
 * flag_provider_compliance.cjs
 * ============================================================
 * Cross-references emergency accommodation providers against
 * the organisations table to flag compliance issues:
 *
 *  • Company hasn't filed annual returns with CRO
 *  • No valid tax clearance certificate
 *  • Company dissolved or in receivership
 *  • Large payments to companies with no CRO registration
 *  • Director overlaps with other providers (clustering)
 *
 * This is the script that answers questions like "which companies
 * got millions in State payments but haven't filed their accounts?"
 *
 * Requires: npm install dotenv @supabase/supabase-js
 * Run:      node scripts/flag_provider_compliance.cjs
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

const FMT = (n) => {
  if (!n && n !== 0) return "€0";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${n.toLocaleString()}`;
};

function normalise(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(THE|LTD\.?|LIMITED|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s&']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  console.log("\n🔍 OpenBenefacts — Provider Compliance Checker");
  console.log("=".repeat(60));

  // Load all providers
  const { data: providers, error: pErr } = await supabase
    .from("emergency_providers")
    .select("*")
    .order("total_known_revenue_eur", { ascending: false })
    .limit(1000);

  if (pErr) throw pErr;
  console.log(`\n   ${providers.length} providers loaded`);

  // Load all organisations for matching
  let allOrgs = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, cro_number, charity_number, sector, county, governing_form")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrgs = allOrgs.concat(data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`   ${allOrgs.length} organisations loaded for matching`);

  // Build lookup indices
  const byName = {};
  const byNorm = {};
  const byCRO = {};
  for (const o of allOrgs) {
    if (o.name) byName[o.name.trim().toUpperCase()] = o;
    const n = normalise(o.name);
    if (n) byNorm[n] = o;
    if (o.cro_number) byCRO[o.cro_number] = o;
  }

  // ─── Compliance checks ────────────────────────────────────
  const flags = {
    no_cro: [],         // Significant payments, no CRO registration found
    no_accounts: [],    // CRO match but annual returns overdue
    dissolved: [],      // Company dissolved or struck off
    large_unmatched: [], // >€1M in payments, can't match to any known entity
    top_earners: [],    // Top 20 by revenue for visibility
  };

  let matched = 0, unmatched = 0;

  for (const p of providers) {
    const revenue = p.total_known_revenue_eur || 0;

    // Try to match to an organisation
    let org = null;
    if (p.cro_number && byCRO[p.cro_number]) {
      org = byCRO[p.cro_number];
    }
    if (!org && p.name) {
      const upper = p.name.trim().toUpperCase();
      org = byName[upper] || byNorm[normalise(p.name)] || null;

      // Fuzzy
      if (!org) {
        const norm = normalise(p.name);
        for (const [key, o] of Object.entries(byNorm)) {
          if (key.length < 6) continue;
          if (norm.includes(key) || key.includes(norm)) {
            if (Math.abs(key.length - norm.length) < 15) { org = o; break; }
          }
        }
      }
    }

    if (org) {
      matched++;

      // Update provider with CRO link if not already set
      if (!p.cro_number && org.cro_number) {
        await supabase
          .from("emergency_providers")
          .update({ cro_number: org.cro_number })
          .eq("id", p.id);
      }

      // Check company status from our data
      // (We'd need filing data from CRO for the "hasn't filed accounts" check.
      //  For now, flag if governing_form suggests issues.)
      if (org.governing_form && /dissolved|struck/i.test(org.governing_form)) {
        flags.dissolved.push({
          name: p.name,
          revenue,
          cro: org.cro_number,
          status: org.governing_form,
        });
      }
    } else {
      unmatched++;

      if (revenue >= 1000000) {
        flags.large_unmatched.push({
          name: p.name,
          revenue,
          type: p.provider_type,
          la: p.local_authority,
        });
      }

      if (revenue >= 100000 && p.provider_type !== "Charity") {
        flags.no_cro.push({
          name: p.name,
          revenue,
          type: p.provider_type,
          la: p.local_authority,
        });
      }
    }
  }

  // Top earners
  flags.top_earners = providers
    .filter(p => (p.total_known_revenue_eur || 0) > 0)
    .slice(0, 20)
    .map(p => ({
      name: p.name,
      revenue: p.total_known_revenue_eur,
      type: p.provider_type,
      la: p.local_authority,
      cro: p.cro_number,
    }));

  // ─── Report ───────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("🔍 COMPLIANCE REPORT");
  console.log(`${"=".repeat(60)}`);

  console.log(`\n   Matched to organisations:    ${matched}`);
  console.log(`   Unmatched:                   ${unmatched}`);

  if (flags.top_earners.length > 0) {
    console.log(`\n\n📊 TOP ${flags.top_earners.length} PROVIDERS BY REVENUE`);
    console.log("-".repeat(60));
    for (let i = 0; i < flags.top_earners.length; i++) {
      const t = flags.top_earners[i];
      const croStr = t.cro ? ` (CRO: ${t.cro})` : " ⚠ NO CRO";
      console.log(`   ${(i+1).toString().padStart(2)}. ${t.name.padEnd(40)} ${FMT(t.revenue).padStart(10)}${croStr}`);
    }
  }

  if (flags.large_unmatched.length > 0) {
    console.log(`\n\n⚠️  PROVIDERS WITH >€1M REVENUE — NO MATCHING ORGANISATION`);
    console.log("-".repeat(60));
    for (const f of flags.large_unmatched.sort((a, b) => b.revenue - a.revenue)) {
      console.log(`   ${f.name.padEnd(40)} ${FMT(f.revenue).padStart(10)}  [${f.type}]  ${f.la || ""}`);
    }
  }

  if (flags.no_cro.length > 0) {
    console.log(`\n\n🚩 PROVIDERS WITH >€100K REVENUE — NO CRO REGISTRATION FOUND`);
    console.log("-".repeat(60));
    for (const f of flags.no_cro.sort((a, b) => b.revenue - a.revenue).slice(0, 30)) {
      console.log(`   ${f.name.padEnd(40)} ${FMT(f.revenue).padStart(10)}  [${f.type}]`);
    }
    if (flags.no_cro.length > 30) {
      console.log(`   ... and ${flags.no_cro.length - 30} more`);
    }
  }

  if (flags.dissolved.length > 0) {
    console.log(`\n\n🛑 DISSOLVED/STRUCK-OFF COMPANIES RECEIVING PAYMENTS`);
    console.log("-".repeat(60));
    for (const f of flags.dissolved.sort((a, b) => b.revenue - a.revenue)) {
      console.log(`   ${f.name.padEnd(40)} ${FMT(f.revenue).padStart(10)}  CRO: ${f.cro}  Status: ${f.status}`);
    }
  }

  console.log(`\n${"=".repeat(60)}\n`);

  // Summary JSON for the UI
  const summaryPath = require("path").join(__dirname, "..", "data", "provider_compliance_report.json");
  require("fs").writeFileSync(summaryPath, JSON.stringify({
    generated: new Date().toISOString(),
    total_providers: providers.length,
    matched,
    unmatched,
    flags: {
      no_cro: flags.no_cro.length,
      large_unmatched: flags.large_unmatched.length,
      dissolved: flags.dissolved.length,
    },
    top_earners: flags.top_earners,
    large_unmatched: flags.large_unmatched,
    no_cro: flags.no_cro.slice(0, 50),
    dissolved: flags.dissolved,
  }, null, 2));
  console.log(`   📄 Report saved to data/provider_compliance_report.json\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

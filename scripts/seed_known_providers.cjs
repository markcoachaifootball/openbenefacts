#!/usr/bin/env node
/**
 * seed_known_providers.cjs
 * ============================================================
 * Seeds emergency_providers and provider_contracts with
 * publicly reported payment data from:
 *
 *   • DCC quarterly purchase order disclosures (2025)
 *   • Irish Times investigative reporting
 *   • The Currency reporting
 *   • Oireachtas committee submissions
 *   • eTenders contract award notices
 *
 * Every figure here is sourced from public reporting.
 * This is NOT scraped data — it's manually curated from
 * journalism and government publications.
 *
 * Run:  node scripts/seed_known_providers.cjs [--execute]
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

// ─── Known providers from public reporting ───────────────────
// Sources cited inline. All values in EUR.
const PROVIDERS = [
  // ── McEnaney family group ──────────────────────────────────
  {
    name: "Brimwood Unlimited",
    trading_name: "Brimwood Hotels",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    notes: "Owned by Séamus 'Banty' McEnaney. Operates Airport Manor Hotel (Dublin), plus hotels in Monaghan, Louth, Donegal, Sligo.",
    contracts: [
      {
        value_eur: 10_400_000,
        award_date: "2025-03-31",
        contract_title: "Emergency accommodation — Q1 2025",
        source_type: "media",
        source_reference: "IT-2025-07-29-mcenaney-q1",
        source_url: "https://www.irishtimes.com/ireland/social-affairs/2025/07/29/seamus-banty-mcenaney-group-paid-more-than-10m-in-three-months-for-housing-dublin-homeless/",
        description: "McEnaney group total Q1 2025 (Brimwood + JMA + related). Reported as '€10M+ in first three months'.",
        awarding_body: "Dublin City Council",
      },
      {
        value_eur: 3_110_000,
        award_date: "2025-09-30",
        contract_title: "Emergency accommodation — Q3 2025 (Brimwood)",
        source_type: "dcc_purchase_orders",
        source_reference: "DCC-PO-Q3-2025-brimwood",
        source_url: "https://www.irishtimes.com/ireland/dublin/2025/12/21/dublin-city-council-spends-58m-on-homeless-accommodation-in-three-month-period/",
        description: "Brimwood Unlimited paid €3.11M in Q3 2025 per DCC purchase order disclosure.",
        awarding_body: "Dublin City Council",
      },
    ],
  },
  {
    name: "JMA Ventures Ltd",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    notes: "Incorporated 2021, Tydavnet, Co Monaghan. Owned by James McCarville (McEnaney nephew).",
    contracts: [
      {
        value_eur: 2_690_000,
        award_date: "2025-09-30",
        contract_title: "Emergency accommodation — Q3 2025 (JMA Ventures)",
        source_type: "dcc_purchase_orders",
        source_reference: "DCC-PO-Q3-2025-jma",
        source_url: "https://www.irishtimes.com/ireland/dublin/2025/12/21/dublin-city-council-spends-58m-on-homeless-accommodation-in-three-month-period/",
        description: "JMA Ventures received €2.69M in Q3 2025.",
        awarding_body: "Dublin City Council",
      },
      {
        value_eur: 5_100_000,
        award_date: "2025-03-31",
        contract_title: "Emergency accommodation — Q1 2025 (JMA via DHLGH)",
        source_type: "media",
        source_reference: "IT-2025-07-29-jma-q1",
        source_url: "https://www.irishtimes.com/ireland/social-affairs/2025/07/29/seamus-banty-mcenaney-group-paid-more-than-10m-in-three-months-for-housing-dublin-homeless/",
        description: "JMA Ventures paid €5.1M by the department in Q1 2025.",
        awarding_body: "DHLGH",
      },
    ],
  },

  // ── Coldec Group — Hatch Hall ──────────────────────────────
  {
    name: "Coldec Group",
    trading_name: "Hatch Hall",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    address: "Hatch Hall, 28 Lower Hatch Street, Dublin 2",
    notes: "10-year contract for Hatch Hall. Contract awarded Oct 2023 via EU TED notice.",
    contracts: [
      {
        value_eur: 86_600_000,
        award_date: "2023-10-01",
        start_date: "2023-10-01",
        end_date: "2033-10-01",
        contract_title: "Hatch Hall — 10-year emergency accommodation lease",
        source_type: "etenders",
        source_reference: "TED-2023-coldec-hatch-hall",
        source_url: "https://thecurrency.news/articles/183687/the-long-battle-for-homelessness-landlord-data-rewinding-the-week-that-was/",
        description: "€86.6M over 10 years for use of Hatch Hall. Published on EU official tenders website.",
        awarding_body: "Dublin City Council",
      },
    ],
  },

  // ── Forbairt group — Sheldon Park Hotel ────────────────────
  {
    name: "Forbairt Orga Tearanta",
    trading_name: "Sheldon Park Hotel",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    address: "Sheldon Park Hotel, Kylemore Road, Dublin 12",
    notes: "Part of Forbairt group (with K&T Forbairt Developments and K&T Forbairt Properties). Paid €10M in 2023.",
    contracts: [
      {
        value_eur: 10_000_000,
        award_date: "2023-12-31",
        contract_title: "Emergency accommodation 2023 (Forbairt group total)",
        source_type: "media",
        source_reference: "IT-2025-forbairt-2023",
        source_url: "https://www.irishtimes.com/ireland/social-affairs/2025/09/18/private-firms-paid-over-450m-for-emergency-accommodation-in-three-months/",
        description: "Forbairt group paid €10M for emergency accommodation in 2023.",
        awarding_body: "Dublin City Council",
      },
    ],
  },
  {
    name: "K&T Forbairt Developments Ltd",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    address: "Sheldon Park Hotel, Kylemore Road, Dublin 12",
    notes: "Part of Forbairt group at Sheldon Park Hotel.",
    contracts: [],
  },
  {
    name: "K&T Forbairt Properties Ltd",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    address: "Sheldon Park Hotel, Kylemore Road, Dublin 12",
    notes: "Part of Forbairt group at Sheldon Park Hotel.",
    contracts: [],
  },

  // ── Country Manor Hotels ───────────────────────────────────
  {
    name: "Country Manor Hotels ULC",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    est_bed_capacity: 562,
    notes: "Contract for 562 emergency beds until June 2033. Total estimated payout €123M. Contract started May 2024.",
    contracts: [
      {
        value_eur: 123_000_000,
        award_date: "2024-05-01",
        start_date: "2024-05-01",
        end_date: "2033-06-30",
        contract_title: "Emergency accommodation — 562 beds to 2033",
        source_type: "dcc_purchase_orders",
        source_reference: "DCC-2024-country-manor-contract",
        source_url: "https://www.irishexaminer.com/news/spotlight/arid-41763029.html",
        description: "562 emergency beds contracted until June 2033. Total estimated payout €123M.",
        awarding_body: "Dublin City Council",
      },
      {
        value_eur: 3_075_000,
        award_date: "2025-09-30",
        contract_title: "Emergency accommodation — Q3 2025",
        source_type: "dcc_purchase_orders",
        source_reference: "DCC-PO-Q3-2025-country-manor",
        source_url: "https://www.irishexaminer.com/news/spotlight/arid-41763029.html",
        description: "Country Manor Hotels ULC paid €3.075M in Q3 2025.",
        awarding_body: "Dublin City Council",
      },
    ],
  },

  // ── Farrell / McNicholas companies ─────────────────────────
  {
    name: "Farrell McNicholas Group",
    provider_type: "Hotel",
    accommodation_type: "PEA",
    region: "Dublin Region",
    local_authority: "Dublin City Council",
    notes: "Three companies owned by Kevin Farrell (Leixlip, Co Kildare) and Thomas McNicholas (Swinford, Co Mayo).",
    contracts: [
      {
        value_eur: 5_460_000,
        award_date: "2025-09-30",
        contract_title: "Emergency accommodation — Q3 2025 (3 companies combined)",
        source_type: "dcc_purchase_orders",
        source_reference: "DCC-PO-Q3-2025-farrell-mcnicholas",
        source_url: "https://www.irishtimes.com/ireland/dublin/2025/12/21/dublin-city-council-spends-58m-on-homeless-accommodation-in-three-month-period/",
        description: "Three Farrell/McNicholas companies paid combined €5.46M in Q3 2025.",
        awarding_body: "Dublin City Council",
      },
    ],
  },
];

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏗️  OpenBenefacts — Provider Seed Data ${DRY_RUN ? "(DRY RUN)" : "⚡ EXECUTING"}`);
  console.log("=".repeat(60));
  if (DRY_RUN) {
    console.log("   Add --execute to actually insert. This is a preview.\n");
  }

  let totalProviders = 0, totalContracts = 0, skippedProviders = 0, skippedContracts = 0;

  for (const p of PROVIDERS) {
    // Calculate total known revenue from contracts
    const totalRevenue = p.contracts.reduce((sum, c) => sum + (c.value_eur || 0), 0);

    console.log(`\n   📌 ${p.name}`);
    if (p.trading_name) console.log(`      Trading as: ${p.trading_name}`);
    console.log(`      Type: ${p.provider_type} | Region: ${p.region}`);
    console.log(`      Total known revenue: €${(totalRevenue / 1e6).toFixed(1)}M`);
    console.log(`      Contracts: ${p.contracts.length}`);

    if (DRY_RUN) {
      totalProviders++;
      totalContracts += p.contracts.length;
      continue;
    }

    // Check if provider already exists
    const { data: existing } = await supabase
      .from("emergency_providers")
      .select("id")
      .eq("name", p.name)
      .eq("local_authority", p.local_authority)
      .maybeSingle();

    let providerId;
    if (existing) {
      console.log(`      ↻ Already exists (id: ${existing.id}), updating...`);
      const { error } = await supabase
        .from("emergency_providers")
        .update({
          trading_name: p.trading_name || null,
          provider_type: p.provider_type,
          accommodation_type: p.accommodation_type || null,
          region: p.region,
          address: p.address || null,
          est_bed_capacity: p.est_bed_capacity || null,
          total_known_revenue_eur: totalRevenue,
          source_count: p.contracts.length,
          notes: p.notes || null,
          first_seen_date: p.contracts.length > 0
            ? p.contracts.reduce((min, c) => c.award_date < min ? c.award_date : min, "9999-12-31")
            : null,
          last_seen_date: p.contracts.length > 0
            ? p.contracts.reduce((max, c) => c.award_date > max ? c.award_date : max, "0000-01-01")
            : null,
        })
        .eq("id", existing.id);
      if (error) { console.log(`      ⚠ Update error: ${error.message}`); skippedProviders++; continue; }
      providerId = existing.id;
      totalProviders++;
    } else {
      const { data: inserted, error } = await supabase
        .from("emergency_providers")
        .insert({
          name: p.name,
          trading_name: p.trading_name || null,
          provider_type: p.provider_type,
          accommodation_type: p.accommodation_type || null,
          region: p.region,
          local_authority: p.local_authority,
          address: p.address || null,
          est_bed_capacity: p.est_bed_capacity || null,
          total_known_revenue_eur: totalRevenue,
          source_count: p.contracts.length,
          notes: p.notes || null,
          first_seen_date: p.contracts.length > 0
            ? p.contracts.reduce((min, c) => c.award_date < min ? c.award_date : min, "9999-12-31")
            : null,
          last_seen_date: p.contracts.length > 0
            ? p.contracts.reduce((max, c) => c.award_date > max ? c.award_date : max, "0000-01-01")
            : null,
        })
        .select("id")
        .single();
      if (error) { console.log(`      ⚠ Insert error: ${error.message}`); skippedProviders++; continue; }
      providerId = inserted.id;
      totalProviders++;
      console.log(`      ✓ Inserted (id: ${providerId})`);
    }

    // Insert contracts
    for (const c of p.contracts) {
      const { data: existingC } = await supabase
        .from("provider_contracts")
        .select("id")
        .eq("source_type", c.source_type)
        .eq("source_reference", c.source_reference)
        .maybeSingle();

      if (existingC) {
        console.log(`      ↻ Contract ${c.source_reference} already exists`);
        skippedContracts++;
        continue;
      }

      const { error: cErr } = await supabase.from("provider_contracts").insert({
        provider_id: providerId,
        provider_name_raw: p.name,
        awarding_body: c.awarding_body || "Dublin City Council",
        local_authority: p.local_authority,
        region: p.region,
        contract_title: c.contract_title,
        value_eur: c.value_eur,
        award_date: c.award_date,
        start_date: c.start_date || null,
        end_date: c.end_date || null,
        source_type: c.source_type,
        source_url: c.source_url || null,
        source_reference: c.source_reference,
        description: c.description || null,
      });

      if (cErr) {
        console.log(`      ⚠ Contract error: ${cErr.message}`);
        skippedContracts++;
      } else {
        console.log(`      ✓ Contract: ${c.contract_title} (€${(c.value_eur / 1e6).toFixed(1)}M)`);
        totalContracts++;
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("🏗️  Seed Data Summary");
  console.log(`   Providers:  ${totalProviders} inserted/updated, ${skippedProviders} errors`);
  console.log(`   Contracts:  ${totalContracts} inserted, ${skippedContracts} skipped/errors`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("   ℹ️  Run with --execute to insert this data.\n");
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

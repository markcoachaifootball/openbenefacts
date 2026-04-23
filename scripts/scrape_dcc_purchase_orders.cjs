#!/usr/bin/env node
/**
 * scrape_dcc_purchase_orders.cjs
 * ============================================================
 * Scrapes Dublin City Council's quarterly purchase order PDFs
 * to extract emergency accommodation provider payments.
 *
 * DCC publishes quarterly purchase orders (>€20k) as PDFs on
 * dublincity.ie. Since 2025, these include payments to emergency
 * accommodation providers (hotels, B&Bs, hostels, companies).
 *
 * This script:
 *  1. Downloads the quarterly purchase order PDFs
 *  2. Extracts rows matching EA-related keywords
 *  3. Upserts into emergency_providers + provider_contracts
 *  4. Cross-references against the organisations table (CRO match)
 *
 * Sources:
 *   https://www.dublincity.ie/council/governance-within-council/
 *     making-informed-and-transparent-decisions/procurement-policy-and-guidelines
 *
 * Requires: npm install pdf-parse dotenv @supabase/supabase-js
 * Run:      node scripts/scrape_dcc_purchase_orders.cjs
 * ============================================================
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const https = require("https");
const http  = require("http");
const { createClient } = require("@supabase/supabase-js");

let pdfParse;
try {
  pdfParse = require("pdf-parse");
} catch (e) {
  console.error("Missing pdf-parse. Install with: npm install pdf-parse");
  process.exit(1);
}

require("dotenv").config();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE creds in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "..", "data", "dcc_purchase_orders");

// ─── Known PDF URLs for DCC quarterly purchase orders ────────
// DCC publishes these at predictable paths. Update this list
// as new quarters are published.
const QUARTERLY_PDFS = [
  // 2025 quarters (DCC started including EA providers in Q1 2025)
  {
    url: "https://www.dublincity.ie/sites/default/files/2025-07/purchase-orders-q1-2025.pdf",
    quarter: "Q1 2025",
    year: 2025,
  },
  {
    url: "https://www.dublincity.ie/sites/default/files/2025-10/purchase-orders-q2-2025.pdf",
    quarter: "Q2 2025",
    year: 2025,
  },
  {
    url: "https://www.dublincity.ie/sites/default/files/2026-01/purchase-orders-q3-2025.pdf",
    quarter: "Q3 2025",
    year: 2025,
  },
  {
    url: "https://www.dublincity.ie/sites/default/files/2026-04/purchase-orders-q4-2025.pdf",
    quarter: "Q4 2025",
    year: 2025,
  },
];

// ─── EA-related keywords to filter purchase order rows ───────
const EA_KEYWORDS = [
  /emergency\s*accommodat/i,
  /homeless\s*accommodat/i,
  /temporary\s*accommodat/i,
  /supported\s*temporary/i,
  /family\s*hub/i,
  /\bPEA\b/,
  /\bSTA\b/,
  /\bTEA\b/,
  /\bDRHE\b/i,
  /provision\s*of\s*accommodat/i,
  /bed\s*nights/i,
  /homeless\s*services/i,
  /rough\s*sleep/i,
];

// Also match by known provider company names
const KNOWN_PROVIDERS = [
  /coldec/i, /mcenaney/i, /bartra/i, /bawnogue/i,
  /hatch\s*hall/i, /travelodge/i, /premier\s*inn/i,
  /maldron/i, /bewleys/i, /jurys/i,
  /loux/i, /farrell.*mcnicholas/i,
];

// ─── LA patterns (reused from etenders scraper) ──────────────
const LA_PATTERNS = [
  { re: /dublin\s*city\s*council/i,      la: "Dublin City Council",                region: "Dublin Region" },
  { re: /d[uú]n\s*laoghaire/i,           la: "Dún Laoghaire-Rathdown County Council", region: "Dublin Region" },
  { re: /fingal/i,                       la: "Fingal County Council",              region: "Dublin Region" },
  { re: /south\s*dublin/i,               la: "South Dublin County Council",        region: "Dublin Region" },
  { re: /drhe|dublin\s*region.*homeless/i, la: "Dublin City Council",              region: "Dublin Region" },
];

function classifyLA(text) {
  for (const p of LA_PATTERNS) if (p.re.test(text)) return { la: p.la, region: p.region };
  return { la: "Dublin City Council", region: "Dublin Region" }; // default for DCC POs
}

function classifyProviderType(text) {
  const t = (text || "").toLowerCase();
  if (/\bhotel\b/.test(t))                           return "Hotel";
  if (/\bb&b|bed\s*&?\s*breakfast/.test(t))           return "B&B";
  if (/\bhostel\b/.test(t))                           return "Hostel";
  if (/\bapartment|apart-?hotel/.test(t))             return "Apartments";
  if (/\bfamily\s*hub\b/.test(t))                     return "Family Hub";
  if (/\bcharity|clg|company.*guarantee/.test(t))     return "Charity";
  if (/\bltd|limited|dac|plc/.test(t))                return "COMPANY";
  return "Unknown";
}

function parseAmount(str) {
  if (!str) return 0;
  if (typeof str === "number") return Math.round(str);
  const cleaned = String(str).replace(/[€$£\s]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

// ─── Download helper ─────────────────────────────────────────
function download(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (OpenBenefacts research bot; team@openbenefacts.ie)",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// ─── Parse a purchase order PDF ──────────────────────────────
// DCC purchase order PDFs are tabular: typically columns like
// Supplier Name | Description | Amount (ex VAT)
// We extract text and parse line by line looking for EA-related entries.
async function parsePurchaseOrderPDF(buffer, quarter) {
  const data = await pdfParse(buffer);
  const text = data.text;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  console.log(`   📄 ${lines.length} lines, ${data.numpages} pages`);

  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line matches EA keywords or known providers
    const isEA = EA_KEYWORDS.some(re => re.test(line)) ||
                 KNOWN_PROVIDERS.some(re => re.test(line));

    if (!isEA) continue;

    // Try to extract supplier name and amount from this line and surrounding lines
    // Common PDF table formats:
    //   "Company Name Ltd    Emergency accommodation provision    €1,234,567"
    //   or split across lines:
    //   "Company Name Ltd"
    //   "Provision of emergency accommodation"
    //   "€1,234,567.00"

    // Look for amounts in this line and nearby lines
    const amountRe = /€[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*(?:EUR|eur)/g;
    let amounts = [];
    const searchWindow = [line, lines[i+1] || "", lines[i-1] || "", lines[i+2] || ""];
    for (const s of searchWindow) {
      const matches = s.match(amountRe);
      if (matches) amounts.push(...matches);
    }

    // Extract the largest amount (likely the contract value)
    let amount = 0;
    for (const a of amounts) {
      const val = parseAmount(a);
      if (val > amount) amount = val;
    }

    // Skip tiny amounts
    if (amount < 20000) continue;

    // Try to extract supplier name — usually at start of line before description
    let supplierName = line;
    // Clean up: remove the description and amount parts
    supplierName = supplierName
      .replace(amountRe, "")
      .replace(/emergency\s*accommodat\w*/gi, "")
      .replace(/homeless\s*accommodat\w*/gi, "")
      .replace(/provision\s*of\s*accommodat\w*/gi, "")
      .replace(/temporary\s*accommodat\w*/gi, "")
      .replace(/supported\s*temporary\w*/gi, "")
      .replace(/bed\s*nights?\w*/gi, "")
      .replace(/homeless\s*services?\w*/gi, "")
      .replace(/\bDRHE\b/gi, "")
      .replace(/\bPEA\b|\bSTA\b|\bTEA\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    // If the name looks too short, check previous line
    if (supplierName.length < 5 && i > 0) {
      supplierName = lines[i - 1].replace(amountRe, "").trim();
    }

    // Skip if we still can't get a name
    if (supplierName.length < 3) continue;

    // Build description from context
    let description = "";
    for (const s of searchWindow) {
      if (EA_KEYWORDS.some(re => re.test(s))) {
        description = s.replace(amountRe, "").trim();
        break;
      }
    }

    entries.push({
      supplier_name: supplierName,
      amount,
      description,
      quarter,
      source_type: "dcc_purchase_order",
    });
  }

  return entries;
}

// ─── Load existing orgs for CRO matching ─────────────────────
async function loadOrganisations() {
  let all = [];
  let page = 0;
  const ps = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, cro_number, sector, county")
      .range(page * ps, (page + 1) * ps - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    page++;
    if (data.length < ps) break;
  }
  return all;
}

function normalise(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(THE|LTD\.?|LIMITED|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s&']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findOrgMatch(name, orgsIndex) {
  if (!name) return null;
  const norm = normalise(name);
  const upper = name.trim().toUpperCase();
  if (orgsIndex.byName[upper]) return orgsIndex.byName[upper];
  if (orgsIndex.byNorm[norm]) return orgsIndex.byNorm[norm];

  // Fuzzy substring
  for (const [key, org] of Object.entries(orgsIndex.byNorm)) {
    if (key.length < 6) continue;
    if (norm.includes(key) || key.includes(norm)) {
      if (Math.abs(key.length - norm.length) < 15) return org;
    }
  }
  return null;
}

// ─── Upsert provider ────────────────────────────────────────
async function upsertProvider(entry, orgsIndex) {
  const { la, region } = classifyLA(entry.description || entry.supplier_name);
  const providerType = classifyProviderType(entry.supplier_name);
  const org = findOrgMatch(entry.supplier_name, orgsIndex);

  // Check if provider exists
  const { data: existing } = await supabase
    .from("emergency_providers")
    .select("id, total_known_revenue_eur, source_count")
    .eq("name", entry.supplier_name)
    .maybeSingle();

  let providerId;

  if (existing) {
    providerId = existing.id;
    // Update revenue total
    const newRevenue = (existing.total_known_revenue_eur || 0) + entry.amount;
    const newCount = (existing.source_count || 0) + 1;
    await supabase
      .from("emergency_providers")
      .update({
        total_known_revenue_eur: newRevenue,
        source_count: newCount,
        cro_number: org?.cro_number || undefined,
      })
      .eq("id", existing.id);
  } else {
    const { data: created, error } = await supabase
      .from("emergency_providers")
      .insert({
        name: entry.supplier_name,
        provider_type: providerType,
        region,
        local_authority: la,
        cro_number: org?.cro_number || null,
        total_known_revenue_eur: entry.amount,
        source_count: 1,
        first_seen_date: new Date().toISOString().slice(0, 10),
        last_seen_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) {
      console.log(`   ⚠ Insert provider failed: ${error.message}`);
      return null;
    }
    providerId = created.id;
  }

  // Insert contract (dedup by source_reference)
  const sourceRef = `dcc-po-${entry.quarter}-${normalise(entry.supplier_name).slice(0, 50)}`;
  const { data: existingContract } = await supabase
    .from("provider_contracts")
    .select("id")
    .eq("source_reference", sourceRef)
    .maybeSingle();

  if (!existingContract) {
    await supabase.from("provider_contracts").insert({
      provider_id: providerId,
      provider_name_raw: entry.supplier_name,
      awarding_body: la,
      local_authority: la,
      region,
      contract_title: entry.description || `Emergency accommodation — ${entry.quarter}`,
      value_eur: entry.amount,
      award_date: new Date().toISOString().slice(0, 10),
      source_type: "dcc_purchase_order",
      source_reference: sourceRef,
      description: `Extracted from DCC purchase orders ${entry.quarter}`,
    });
    return "inserted";
  }
  return "skipped";
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log("\n🏛️  OpenBenefacts — DCC Purchase Order Scraper");
  console.log("=".repeat(60));

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Load orgs for matching
  const orgs = await loadOrganisations();
  const orgsIndex = {
    byName: {},
    byNorm: {},
  };
  for (const o of orgs) {
    if (o.name) orgsIndex.byName[o.name.trim().toUpperCase()] = o;
    const n = normalise(o.name);
    if (n) orgsIndex.byNorm[n] = o;
  }
  console.log(`   ${orgs.length} organisations loaded for matching\n`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const pdfInfo of QUARTERLY_PDFS) {
    console.log(`\n📥 ${pdfInfo.quarter}`);
    console.log(`   URL: ${pdfInfo.url}`);

    const filename = path.join(DATA_DIR, `dcc-po-${pdfInfo.quarter.replace(/\s/g, "-").toLowerCase()}.pdf`);

    // Download if not cached
    let buffer;
    if (fs.existsSync(filename)) {
      console.log("   📁 Using cached PDF");
      buffer = fs.readFileSync(filename);
    } else {
      try {
        console.log("   ⬇ Downloading...");
        buffer = await download(pdfInfo.url);
        fs.writeFileSync(filename, buffer);
        console.log(`   ✓ Saved (${(buffer.length / 1024).toFixed(0)} KB)`);
      } catch (e) {
        console.log(`   ✗ Download failed: ${e.message}`);
        console.log("   → This PDF may not be published yet. Skipping.");
        totalErrors++;
        continue;
      }
    }

    // Parse
    try {
      const entries = await parsePurchaseOrderPDF(buffer, pdfInfo.quarter);
      console.log(`   ✓ Found ${entries.length} EA-related entries`);

      for (const entry of entries) {
        try {
          const result = await upsertProvider(entry, orgsIndex);
          if (result === "inserted") totalInserted++;
          else totalSkipped++;
        } catch (e) {
          totalErrors++;
          if (totalErrors <= 5) console.log(`   ✗ ${entry.supplier_name}: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`   ✗ PDF parse failed: ${e.message}`);
      totalErrors++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("🏛️  DCC Purchase Order Import Summary");
  console.log(`   Inserted:  ${totalInserted}`);
  console.log(`   Skipped:   ${totalSkipped}`);
  console.log(`   Errors:    ${totalErrors}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

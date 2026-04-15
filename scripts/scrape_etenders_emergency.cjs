#!/usr/bin/env node
/**
 * scrape_etenders_emergency.cjs
 * ============================================================
 * Scrapes eTenders.gov.ie for emergency accommodation contract
 * award notices. eTenders publishes contract awards ≥ €25k.
 *
 * Strategy: their public search supports keyword queries and
 * returns HTML + JSON. We hit the public "notices" search endpoint
 * with homelessness keywords and parse contract award records.
 *
 * Run:  node scripts/scrape_etenders_emergency.cjs
 * ============================================================
 */
"use strict";

const https = require("https");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE creds in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Keywords that indicate emergency accommodation contracts ──
const KEYWORDS = [
  "emergency accommodation",
  "homeless accommodation",
  "homelessness service",
  "temporary accommodation",
  "supported temporary accommodation",
  "private emergency accommodation",
  "bed and breakfast homeless",
  "hostel homeless",
  "rough sleeper",
  "family hub",
];

// ─── LA contracting authority name normaliser ──────────────────
const LA_PATTERNS = [
  { re: /dublin\s*city\s*council/i,      la: "Dublin City Council",                region: "Dublin Region" },
  { re: /d[uú]n\s*laoghaire/i,           la: "Dún Laoghaire-Rathdown County Council", region: "Dublin Region" },
  { re: /fingal/i,                       la: "Fingal County Council",              region: "Dublin Region" },
  { re: /south\s*dublin/i,               la: "South Dublin County Council",        region: "Dublin Region" },
  { re: /kildare/i,                      la: "Kildare County Council",             region: "Mid-East" },
  { re: /meath/i,                        la: "Meath County Council",               region: "Mid-East" },
  { re: /wicklow/i,                      la: "Wicklow County Council",             region: "Mid-East" },
  { re: /waterford/i,                    la: "Waterford City & County Council",    region: "South-East" },
  { re: /wexford/i,                      la: "Wexford County Council",             region: "South-East" },
  { re: /kilkenny/i,                     la: "Kilkenny County Council",            region: "South-East" },
  { re: /carlow/i,                       la: "Carlow County Council",              region: "South-East" },
  { re: /cork\s*city/i,                  la: "Cork City Council",                  region: "South" },
  { re: /cork\s*county/i,                la: "Cork County Council",                region: "South" },
  { re: /kerry/i,                        la: "Kerry County Council",               region: "South" },
  { re: /limerick/i,                     la: "Limerick City & County Council",     region: "Mid-West" },
  { re: /clare/i,                        la: "Clare County Council",               region: "Mid-West" },
  { re: /tipperary/i,                    la: "Tipperary County Council",           region: "Mid-West" },
  { re: /galway\s*city/i,                la: "Galway City Council",                region: "West" },
  { re: /galway\s*county/i,              la: "Galway County Council",              region: "West" },
  { re: /mayo/i,                         la: "Mayo County Council",                region: "West" },
  { re: /roscommon/i,                    la: "Roscommon County Council",           region: "West" },
  { re: /donegal/i,                      la: "Donegal County Council",             region: "Border" },
  { re: /louth/i,                        la: "Louth County Council",               region: "Border" },
  { re: /cavan/i,                        la: "Cavan County Council",               region: "Border" },
  { re: /monaghan/i,                     la: "Monaghan County Council",            region: "Border" },
  { re: /sligo/i,                        la: "Sligo County Council",               region: "Border" },
  { re: /laois/i,                        la: "Laois County Council",               region: "Midlands" },
  { re: /offaly/i,                       la: "Offaly County Council",              region: "Midlands" },
  { re: /longford/i,                     la: "Longford County Council",            region: "Midlands" },
  { re: /westmeath/i,                    la: "Westmeath County Council",           region: "Midlands" },
  { re: /leitrim/i,                      la: "Leitrim County Council",             region: "North-West" },
  { re: /dublin\s*region(al)?\s*homeless\s*executive|drhe/i, la: "Dublin City Council", region: "Dublin Region" },
];

function classifyLA(text) {
  for (const p of LA_PATTERNS) if (p.re.test(text)) return { la: p.la, region: p.region };
  return { la: null, region: null };
}

function classifyProviderType(text) {
  const t = text.toLowerCase();
  if (/\bhotel\b/.test(t))          return "Hotel";
  if (/\bb&b|bed\s*&?\s*breakfast/.test(t)) return "B&B";
  if (/\bhostel\b/.test(t))         return "Hostel";
  if (/\bapartment|apart-?hotel/.test(t)) return "Apartments";
  if (/\bfamily\s*hub\b/.test(t))   return "Family Hub";
  if (/\bcharity|clg|company\s*limited\s*by\s*guarantee/.test(t)) return "Charity";
  return "Unknown";
}

// ─── eTenders search ─────────────────────────────────────────
// Public search URL pattern (etenders.gov.ie uses JCache behind the scenes).
// We use the legacy public search that returns HTML with structured data.
function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: opts.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (OpenBenefacts research bot; contact@openbenefacts.com)",
        "Accept": "text/html,application/json",
        ...opts.headers,
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, opts));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// eTenders exposes public notice search at:
//   https://www.etenders.gov.ie/epps/quickSearchAction.do?d-16544-p={page}&searchSpace=all&latest=false&searchValue={keyword}
async function searchETenders(keyword, page = 1) {
  const url = `https://www.etenders.gov.ie/epps/quickSearchAction.do?d-16544-p=${page}&searchSpace=all&latest=false&searchValue=${encodeURIComponent(keyword)}`;
  const { status, body } = await fetchUrl(url);
  return { status, html: body, url };
}

// Parse award notice HTML — extracts contract title, awarding body, value, award date
// This is rough regex-based parsing; eTenders doesn't publish a clean JSON feed.
function parseAwardNotices(html, keyword) {
  const notices = [];
  // Each notice row appears inside <tr> with href pointing to /epps/cft/viewContractDetails.do
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const row = m[1];
    const titleMatch = row.match(/viewContractDetails\.do\?contractId=(\d+)[^>]*>([^<]+)</);
    if (!titleMatch) continue;
    const id = titleMatch[1];
    const title = titleMatch[2].trim();
    // Awarding body usually in a <td> after title
    const bodyMatch = row.match(/<td[^>]*>([^<]*(?:Council|Executive|Department|HSE|Board)[^<]*)<\/td>/i);
    const awardingBody = bodyMatch ? bodyMatch[1].trim() : "";
    // Value (€ nnn,nnn)
    const valueMatch = row.match(/€\s*([\d,]+(?:\.\d{2})?)/);
    const value = valueMatch ? parseInt(valueMatch[1].replace(/,/g, ""), 10) : null;
    // Date (dd/mm/yyyy)
    const dateMatch = row.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;

    notices.push({
      id,
      title,
      awardingBody,
      value,
      awardDate: date,
      url: `https://www.etenders.gov.ie/epps/cft/viewContractDetails.do?contractId=${id}`,
      keyword,
    });
  }
  return notices;
}

// ─── Fetch individual contract detail page to get winning bidder ──
async function fetchContractDetail(contractId) {
  const url = `https://www.etenders.gov.ie/epps/cft/viewContractDetails.do?contractId=${contractId}`;
  const { body } = await fetchUrl(url);

  // Award recipient often labelled "Name of successful economic operator" or "Awarded to"
  const bidderMatch = body.match(/(?:Name of (?:successful )?(?:economic operator|tenderer|contractor)|Awarded to|Winning bidder)[:\s]*<[^>]*>([^<]+)</i);
  const bidder = bidderMatch ? bidderMatch[1].trim() : null;

  // Description / CPV
  const descMatch = body.match(/(?:Short description|Contract description)[:\s]*<[^>]*>([^<]+)</i);
  const description = descMatch ? descMatch[1].trim() : null;

  return { bidder, description };
}

// ─── Upsert helpers ──────────────────────────────────────────
async function upsertProvider(name, ctx) {
  if (!name) return null;
  const cleanName = name.replace(/\s+/g, " ").trim();
  const { la, region } = ctx;

  // Try to find existing
  const { data: existing } = await supabase
    .from("emergency_providers")
    .select("id, total_known_revenue_eur, source_count")
    .ilike("name", cleanName)
    .eq("local_authority", la || "")
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("emergency_providers")
    .insert({
      name: cleanName,
      provider_type: classifyProviderType(cleanName),
      region: ctx.region,
      local_authority: ctx.la,
      first_seen_date: ctx.awardDate,
      last_seen_date: ctx.awardDate,
      source_count: 1,
    })
    .select("id")
    .single();

  if (error) { console.warn(`   ! provider insert: ${error.message}`); return null; }
  return data.id;
}

async function insertContract(record) {
  const { error } = await supabase
    .from("provider_contracts")
    .upsert(record, { onConflict: "source_type,source_reference" });
  if (error) console.warn(`   ! contract insert: ${error.message}`);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n🏢 OpenBenefacts — eTenders emergency accommodation scraper");
  console.log("=".repeat(60));

  const allNotices = [];
  for (const kw of KEYWORDS) {
    console.log(`\n🔍 keyword: "${kw}"`);
    for (let page = 1; page <= 5; page++) {
      const { status, html } = await searchETenders(kw, page);
      if (status !== 200) { console.warn(`   ! HTTP ${status}`); break; }
      const notices = parseAwardNotices(html, kw);
      if (!notices.length) break;
      console.log(`   page ${page}: ${notices.length} notices`);
      allNotices.push(...notices);
      await new Promise(r => setTimeout(r, 500)); // be polite
    }
  }

  // Dedupe by contract ID
  const uniq = new Map();
  for (const n of allNotices) if (!uniq.has(n.id)) uniq.set(n.id, n);
  console.log(`\n📋 Total unique notices: ${uniq.size}`);

  let providerCount = 0, contractCount = 0;
  for (const notice of uniq.values()) {
    const { la, region } = classifyLA(notice.awardingBody + " " + notice.title);
    console.log(`\n• ${notice.title.slice(0, 60)}…`);
    console.log(`  ${notice.awardingBody} | €${notice.value?.toLocaleString() || "?"} | ${notice.awardDate || "?"}`);

    const detail = await fetchContractDetail(notice.id);
    await new Promise(r => setTimeout(r, 800));

    if (!detail.bidder) { console.log(`  ⚠️  no bidder info`); continue; }
    console.log(`  → bidder: ${detail.bidder}`);

    const providerId = await upsertProvider(detail.bidder, { la, region, awardDate: notice.awardDate });
    if (providerId) providerCount++;

    await insertContract({
      provider_id: providerId,
      provider_name_raw: detail.bidder,
      awarding_body: notice.awardingBody,
      local_authority: la,
      region,
      contract_title: notice.title,
      value_eur: notice.value,
      award_date: notice.awardDate,
      source_type: "etenders",
      source_url: notice.url,
      source_reference: `etenders_${notice.id}`,
      description: detail.description,
    });
    contractCount++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Providers touched: ${providerCount}`);
  console.log(`✅ Contracts recorded: ${contractCount}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

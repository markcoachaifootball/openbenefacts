#!/usr/bin/env node
/**
 * scrape_ted_emergency.cjs
 * ============================================================
 * Replacement for the eTenders scraper. eTenders is a JSF/PrimeFaces
 * session app that returns empty bodies to plain HTTP clients.
 *
 * TED (Tenders Electronic Daily) republishes every Irish contract
 * award above EU threshold (~€140k services) as structured data,
 * and exposes a JSON search API:
 *   https://api.ted.europa.eu/v3/notices/search
 *
 * Query: country=IE + keyword in title/description + notice-type = result
 * (contract award). We hit this for our homelessness keywords and
 * upsert provider + contract rows.
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

const KEYWORDS = [
  "emergency accommodation",
  "homeless accommodation",
  "homelessness service",
  "temporary accommodation homeless",
  "supported temporary accommodation",
  "private emergency accommodation",
  "family hub",
  "rough sleeper",
];

// ─── LA normaliser (same as before) ───────────────────────────
const LA_PATTERNS = [
  [/dublin\s*city/i,               "Dublin City Council",                   "Dublin Region"],
  [/d[uú]n\s*laoghaire|dlr/i,      "Dún Laoghaire-Rathdown County Council", "Dublin Region"],
  [/fingal/i,                      "Fingal County Council",                 "Dublin Region"],
  [/south\s*dublin/i,              "South Dublin County Council",           "Dublin Region"],
  [/drhe|dublin\s*region(al)?\s*homeless/i, "Dublin City Council",          "Dublin Region"],
  [/cork\s*city/i,                 "Cork City Council",                     "South"],
  [/cork\s*county/i,               "Cork County Council",                   "South"],
  [/kerry/i,                       "Kerry County Council",                  "South"],
  [/limerick/i,                    "Limerick City & County Council",        "Mid-West"],
  [/clare/i,                       "Clare County Council",                  "Mid-West"],
  [/tipperary/i,                   "Tipperary County Council",              "Mid-West"],
  [/galway\s*city/i,               "Galway City Council",                   "West"],
  [/galway\s*county/i,             "Galway County Council",                 "West"],
  [/mayo/i,                        "Mayo County Council",                   "West"],
  [/roscommon/i,                   "Roscommon County Council",              "West"],
  [/waterford/i,                   "Waterford City & County Council",       "South-East"],
  [/wexford/i,                     "Wexford County Council",                "South-East"],
  [/kilkenny/i,                    "Kilkenny County Council",               "South-East"],
  [/carlow/i,                      "Carlow County Council",                 "South-East"],
  [/kildare/i,                     "Kildare County Council",                "Mid-East"],
  [/meath/i,                       "Meath County Council",                  "Mid-East"],
  [/wicklow/i,                     "Wicklow County Council",                "Mid-East"],
  [/donegal/i,                     "Donegal County Council",                "Border"],
  [/louth/i,                       "Louth County Council",                  "Border"],
  [/cavan/i,                       "Cavan County Council",                  "Border"],
  [/monaghan/i,                    "Monaghan County Council",               "Border"],
  [/sligo/i,                       "Sligo County Council",                  "Border"],
  [/leitrim/i,                     "Leitrim County Council",                "North-West"],
  [/laois/i,                       "Laois County Council",                  "Midlands"],
  [/offaly/i,                      "Offaly County Council",                 "Midlands"],
  [/longford/i,                    "Longford County Council",               "Midlands"],
  [/westmeath/i,                   "Westmeath County Council",              "Midlands"],
];
function classifyLA(text) {
  for (const [re, la, region] of LA_PATTERNS) if (re.test(text || "")) return { la, region };
  return { la: null, region: null };
}

function classifyProviderType(name) {
  const t = (name || "").toLowerCase();
  if (/\bhotel\b/.test(t))                return "Hotel";
  if (/\bb&b|bed\s*&?\s*breakfast/.test(t)) return "B&B";
  if (/\bhostel\b/.test(t))               return "Hostel";
  if (/\bapartment|apart-?hotel/.test(t)) return "Apartments";
  if (/\bfamily\s*hub\b/.test(t))         return "Family Hub";
  if (/\bclg|charity|company\s*limited\s*by\s*guarantee/.test(t)) return "Charity";
  if (/\bltd|limited|dac|plc\b/.test(t))  return "Company";
  return "Unknown";
}

// ─── TED API ──────────────────────────────────────────────────
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "OpenBenefacts research (contact@openbenefacts.com)",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// TED Search API v3 — documented at
// https://docs.ted.europa.eu/api/index.html
// Expert query language: "notice-type IN (29 30 7) AND buyer-country = IE AND <keyword>"
// Notice types: 7 = Contract Award Notice, 29 = Result, 30 = Contract Modification
async function searchTed(keyword, page = 1) {
  // TED expert query: country = Ireland + FT (full-text) match on keyword
  const query = `(buyer-country = "IRL" OR place-of-performance = "IRL") AND FT~"${keyword}"`;
  const body = {
    query,
    page,
    limit: 50,
    scope: "ACTIVE",
    onlyLatestVersions: true,
    paginationMode: "PAGE_NUMBER",
    // no `fields` — TED returns its default summary fields
  };
  return postJson("https://api.ted.europa.eu/v3/notices/search", body);
}

// ─── Supabase helpers ────────────────────────────────────────
async function upsertProvider(name, ctx) {
  if (!name) return null;
  const clean = name.replace(/\s+/g, " ").trim();
  const { data: existing } = await supabase
    .from("emergency_providers")
    .select("id, source_count")
    .ilike("name", clean)
    .maybeSingle();
  if (existing) {
    await supabase.from("emergency_providers")
      .update({ source_count: (existing.source_count || 0) + 1, last_seen_date: ctx.date })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await supabase.from("emergency_providers").insert({
    name: clean,
    provider_type: classifyProviderType(clean),
    region: ctx.region, local_authority: ctx.la,
    first_seen_date: ctx.date, last_seen_date: ctx.date,
    source_count: 1,
  }).select("id").single();
  if (error) { console.warn(`   ! ${error.message}`); return null; }
  return data.id;
}

async function insertContract(row) {
  const { error } = await supabase.from("provider_contracts")
    .upsert(row, { onConflict: "source_type,source_reference" });
  if (error) console.warn(`   ! ${error.message}`);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n📡 OpenBenefacts — TED contract-award scraper (Ireland)");
  console.log("=".repeat(60));

  const seen = new Map(); // pub-number → notice
  for (const kw of KEYWORDS) {
    console.log(`\n🔍 keyword: "${kw}"`);
    for (let page = 1; page <= 5; page++) {
      const { status, json, raw } = await searchTed(kw, page);
      if (status !== 200 || !json) {
        console.warn(`   ! HTTP ${status}`);
        if (raw) console.warn(`   raw: ${raw.slice(0, 400)}`);
        if (json?.message) console.warn(`   msg: ${json.message.slice(0, 400)}`);
        break;
      }
      const notices = json.notices || json.results || [];
      console.log(`   page ${page}: ${notices.length} notices  (total=${json.totalNoticeCount ?? "?"})`);
      for (const n of notices) {
        const key = n["publication-number"] || n.publicationNumber || JSON.stringify(n).slice(0, 60);
        if (!seen.has(key)) seen.set(key, n);
      }
      if (!notices.length) break;
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log(`\n📋 Total unique Irish notices matching: ${seen.size}`);
  if (!seen.size) {
    console.log("   (nothing matched — TED API may have changed schema; dumping one raw response below)");
    const { json } = await searchTed("homeless", 1);
    console.log(JSON.stringify(json, null, 2).slice(0, 1200));
    return;
  }

  let providerCount = 0, contractCount = 0;
  for (const n of seen.values()) {
    const title      = n["notice-title"] || n.title || "";
    const buyer      = n["buyer-name"] || n.buyerName || "";
    const winner     = n["winner-name"] || n.winner || n["winner"] || "";
    const valueRaw   = n["total-value"] || n["contract-value"] || n.totalValue || null;
    const pubDate    = n["publication-date"] || n.publicationDate || null;
    const pubNumber  = n["publication-number"] || n.publicationNumber || "";
    const description= n["description-lot"] || n.description || "";

    const value = typeof valueRaw === "number" ? valueRaw
                : typeof valueRaw === "string" ? parseFloat(valueRaw.replace(/[^0-9.]/g, "")) || null
                : null;

    const winnerName = Array.isArray(winner) ? winner[0] : winner;
    if (!winnerName) continue;

    const { la, region } = classifyLA(`${buyer} ${title}`);
    const date = pubDate ? pubDate.slice(0, 10) : null;

    console.log(`\n• ${title.slice(0, 70)}`);
    console.log(`  buyer=${buyer} | winner=${winnerName} | €${value?.toLocaleString() || "?"} | ${date || "?"}`);

    const pid = await upsertProvider(winnerName, { la, region, date });
    if (pid) providerCount++;

    if (value && value > 5000 && pid) {
      await insertContract({
        provider_id: pid,
        provider_name_raw: winnerName,
        awarding_body: buyer,
        local_authority: la,
        region,
        contract_title: title.slice(0, 500),
        value_eur: Math.round(value),
        award_date: date,
        source_type: "ted",
        source_url: `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`,
        source_reference: `ted_${pubNumber}`.slice(0, 200),
        description: description.slice(0, 1000),
      });
      contractCount++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Providers touched:   ${providerCount}`);
  console.log(`✅ Contracts recorded:  ${contractCount}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

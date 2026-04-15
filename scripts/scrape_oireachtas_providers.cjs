#!/usr/bin/env node
/**
 * scrape_oireachtas_providers.cjs  (v2 — uses XML debate records)
 * ============================================================
 * Pulls parliamentary questions about emergency accommodation
 * from api.oireachtas.ie, fetches the full XML debate records
 * for matching questions, and extracts provider names + values
 * from the Minister's answer text.
 *
 * Flow:
 *   1. Paginate /v1/questions for the date range
 *   2. Client-side filter: question showAs contains keyword
 *   3. For matches, fetch the debate section XML
 *   4. Extract speech text, run provider regex + €-value extraction
 *   5. Upsert providers + contracts
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

// ─── Keywords in the question text ───────────────────────────
const KEYWORDS = [
  "emergency accommodation", "homeless", "homelessness",
  "private emergency", "supported temporary", "family hub",
  "b&b", "bed and breakfast", "rough sleep",
];

function matchesKeyword(text) {
  const t = (text || "").toLowerCase();
  return KEYWORDS.some(k => t.includes(k));
}

// ─── HTTP ────────────────────────────────────────────────────
function fetchUrl(url, asJson = false) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "OpenBenefacts research (contact@openbenefacts.com)",
        "Accept": asJson ? "application/json" : "application/xml,text/xml,*/*",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, asJson));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (asJson) {
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, json: null, raw: data }); }
        } else {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on("error", reject);
  });
}

// ─── Paginate questions ──────────────────────────────────────
async function fetchQuestions(startDate, endDate) {
  const PAGE = 500;
  const all = [];
  for (let skip = 0; skip < 20000; skip += PAGE) {
    const url = `https://api.oireachtas.ie/v1/questions?date_start=${startDate}&date_end=${endDate}&chamber=dail&limit=${PAGE}&skip=${skip}`;
    process.stdout.write(`  fetch skip=${skip}… `);
    const { status, json } = await fetchUrl(url, true);
    if (status !== 200 || !json) { console.log(`HTTP ${status}`); break; }
    const results = json.results || [];
    console.log(`${results.length} returned`);
    all.push(...results);
    if (results.length < PAGE) break;
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

// ─── Fetch + parse XML speech content ────────────────────────
async function fetchSpeechText(xmlUri) {
  if (!xmlUri) return "";
  const { status, body } = await fetchUrl(xmlUri);
  if (status !== 200) return "";
  // Strip tags, keep text. Most valuable text is in <speech> elements.
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

// ─── Provider extraction ─────────────────────────────────────
const BLACKLIST = new Set([
  "Dublin City Council", "Cork City Council", "Dublin Region",
  "Department of Housing", "Local Government", "Minister",
  "Government", "State", "Ireland", "Oireachtas", "Dáil",
  "The Minister", "The Department", "The State", "The Government",
  "European Union", "Housing Agency", "The Executive",
]);

// First-word blacklist: reject capture groups that START with a generic
// category word — these are keyword phrases, not providers.
const GENERIC_PREFIXES = new Set([
  "Emergency", "Shared", "Homeless", "Homelessness", "International",
  "Ipas", "IPAS", "Pathway", "Temporary", "Supported", "Private", "Family",
  "Social", "Transitional", "Community", "Public", "Local", "Suitable",
  "Own-Door", "Refuge", "Refugee", "Ukrainian", "State", "Non-Commercial",
  "Standard", "Direct", "Housing", "Tenant", "Modular", "Prefabricated",
  "Core", "General", "Dedicated", "Additional", "New", "Existing",
  "Congregated", "Domestic", "Mixed",
]);

// Whole-name reject list for post-capture cleanup.
const REJECT_EXACT = new Set([
  "Emergency Accommodation", "Homeless Accommodation",
  "Homelessness Accommodation", "Shared Accommodation",
  "Ipas Accommodation", "IPAS Accommodation",
  "International Protection Accommodation", "Pathway Accommodation",
  "Temporary Accommodation", "Supported Temporary Accommodation",
  "Private Emergency Accommodation", "Family Hub",
  "Community House", "Public House", "Social House", "Safe House",
  "Direct Provision Accommodation",
]);

const PROVIDER_PATTERNS = [
  /\b([A-Z][A-Za-z'&\-]+(?:\s+[A-Z][A-Za-z'&\-]+){0,4})\s+(Hotel|Hotels|B&B|Bed\s*&\s*Breakfast|Hostel|Apartments|Apart-Hotel|Lodge|Inn|Suites|Residence)\b/g,
  /\b([A-Z][A-Za-z'&\-]+(?:\s+[A-Z][A-Za-z'&\-]+){0,4})\s+(Ltd\.?|Limited|CLG|DAC|Plc\.?|Unlimited\s+Company)\b/g,
];

function extractProviders(text) {
  const found = new Map();   // name → first-occurrence idx
  for (const re of PROVIDER_PATTERNS) {
    const rx = new RegExp(re.source, "g");
    let m;
    while ((m = rx.exec(text)) !== null) {
      const firstWord = m[1].split(/\s+/)[0];
      if (GENERIC_PREFIXES.has(firstWord)) continue;
      const name = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
      if (REJECT_EXACT.has(name)) continue;
      if (BLACKLIST.has(name) || BLACKLIST.has(m[1])) continue;
      if (name.length < 8 || name.length > 80) continue;
      // Must contain at least one word >=4 chars that isn't a generic
      const words = m[1].split(/\s+/);
      const hasProper = words.some(w => w.length >= 4 && !GENERIC_PREFIXES.has(w));
      if (!hasProper) continue;
      if (!found.has(name)) found.set(name, m.index);
    }
  }
  return [...found.entries()].map(([name, idx]) => ({ name, idx }));
}

function extractValuesNear(text, idx, radius = 400) {
  const win = text.slice(Math.max(0, idx - radius), idx + radius);
  const rx = /€\s*([\d,]+(?:\.\d+)?)\s*(million|m\b|billion|bn|thousand|k\b)?/gi;
  const values = [];
  let m;
  while ((m = rx.exec(win)) !== null) {
    let v = parseFloat(m[1].replace(/,/g, ""));
    const mult = (m[2] || "").toLowerCase();
    if (/million|^m$/.test(mult))  v *= 1_000_000;
    else if (/billion|bn/.test(mult)) v *= 1_000_000_000;
    else if (/thousand|^k$/.test(mult)) v *= 1_000;
    if (v >= 1_000) values.push(Math.round(v));
  }
  return values;
}

// ─── LA classifier ───────────────────────────────────────────
const LA_RE = [
  [/dublin\s*city/i,         "Dublin City Council",                "Dublin Region"],
  [/d[uú]n\s*laoghaire/i,    "Dún Laoghaire-Rathdown County Council", "Dublin Region"],
  [/fingal/i,                "Fingal County Council",              "Dublin Region"],
  [/south\s*dublin/i,        "South Dublin County Council",        "Dublin Region"],
  [/cork\s*city/i,           "Cork City Council",                  "South"],
  [/cork\s*county/i,         "Cork County Council",                "South"],
  [/limerick/i,              "Limerick City & County Council",     "Mid-West"],
  [/galway\s*city/i,         "Galway City Council",                "West"],
  [/waterford/i,             "Waterford City & County Council",    "South-East"],
];
function classifyLA(text) {
  for (const [re, la, region] of LA_RE) if (re.test(text)) return { la, region };
  return { la: null, region: null };
}

// ─── Supabase helpers ────────────────────────────────────────
async function upsertProvider(name, ctx) {
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
  const type = /hotel/i.test(clean)  ? "Hotel"
           : /b&b|bed.*breakfast/i.test(clean) ? "B&B"
           : /hostel/i.test(clean)   ? "Hostel"
           : /apartments?/i.test(clean) ? "Apartments"
           : "Company";
  const { data, error } = await supabase.from("emergency_providers").insert({
    name: clean, provider_type: type,
    region: ctx.region, local_authority: ctx.la,
    first_seen_date: ctx.date, last_seen_date: ctx.date,
    source_count: 1,
  }).select("id").single();
  if (error) { console.warn(`  ! ${error.message}`); return null; }
  return data.id;
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n📜 OpenBenefacts — Oireachtas PQ provider scraper (v2)");
  console.log("=".repeat(60));

  const startDate = "2023-01-01";
  const endDate = new Date().toISOString().slice(0, 10);

  console.log(`\n1) Fetching all Dáil questions ${startDate} → ${endDate}`);
  const all = await fetchQuestions(startDate, endDate);
  console.log(`   Total: ${all.length} questions`);

  // Filter: showAs contains any keyword
  const relevant = all.filter(r => matchesKeyword(r?.question?.showAs));
  console.log(`\n2) Relevant (mention housing/homelessness): ${relevant.length}`);

  // Dedupe XML URIs — many questions share a debate section
  const xmlUris = new Map();
  for (const r of relevant) {
    const uri = r?.question?.debateSection?.formats?.xml?.uri;
    if (uri && !xmlUris.has(uri)) xmlUris.set(uri, r);
  }
  console.log(`   Unique debate section XML files: ${xmlUris.size}`);

  let providerCount = 0, contractCount = 0, skipped = 0;
  let processed = 0;

  for (const [uri, q] of xmlUris) {
    processed++;
    if (processed % 10 === 0) console.log(`\n   ... processed ${processed}/${xmlUris.size}  (providers: ${providerCount}, contracts: ${contractCount})`);

    const text = await fetchSpeechText(uri);
    await new Promise(r => setTimeout(r, 250));

    if (!text || text.length < 200) { skipped++; continue; }
    if (!matchesKeyword(text)) { skipped++; continue; }  // confirm answer body is relevant

    const providers = extractProviders(text);
    if (!providers.length) continue;

    const date = q?.question?.date || q?.contextDate;
    for (const { name, idx } of providers) {
      const { la, region } = classifyLA(text.slice(Math.max(0, idx - 400), idx + 400));
      const values = extractValuesNear(text, idx);
      const maxVal = values.length ? Math.max(...values) : null;

      const pid = await upsertProvider(name, { la, region, date });
      if (pid) providerCount++;

      if (maxVal && maxVal > 10_000 && pid) {
        const ref = `oir_${uri.split("/").slice(-3).join("_")}_${name.slice(0, 25).replace(/\s/g, "_")}`;
        await supabase.from("provider_contracts").upsert({
          provider_id: pid,
          provider_name_raw: name,
          awarding_body: la || "Department of Housing",
          local_authority: la, region,
          contract_title: `PQ mention: ${q?.question?.showAs?.slice(0, 120) || "homeless/accom"}`,
          value_eur: maxVal,
          award_date: date,
          source_type: "oireachtas_pq",
          source_url: q?.question?.uri || uri,
          source_reference: ref.slice(0, 200),
          description: `Figure (€${maxVal.toLocaleString()}) appeared within 400 chars of provider name in PQ answer.`,
        }, { onConflict: "source_type,source_reference" });
        contractCount++;
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Summary`);
  console.log(`  Questions scanned:     ${all.length}`);
  console.log(`  Relevant questions:    ${relevant.length}`);
  console.log(`  XML sections fetched:  ${xmlUris.size - skipped}`);
  console.log(`  Providers recorded:    ${providerCount}`);
  console.log(`  Contracts recorded:    ${contractCount}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

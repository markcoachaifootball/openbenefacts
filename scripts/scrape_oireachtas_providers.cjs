#!/usr/bin/env node
/**
 * scrape_oireachtas_providers.cjs
 * ============================================================
 * Pulls parliamentary question (PQ) responses mentioning
 * emergency accommodation providers from api.oireachtas.ie.
 *
 * The Minister for Housing routinely lists provider names and
 * spending figures in PQ responses. This script extracts:
 *   • provider names (capitalised proper-noun sequences near
 *     keywords like "hotel", "B&B", "hostel", "Ltd", "CLG")
 *   • contract / spend values (€-prefixed numbers in the same
 *     paragraph)
 *   • the PQ reference + URL as the source
 *
 * Run:  node scripts/scrape_oireachtas_providers.cjs
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

// ─── PQ topics to search ─────────────────────────────────────
const TOPICS = [
  "emergency accommodation",
  "homelessness",
  "private emergency accommodation",
  "supported temporary accommodation",
  "family hub",
  "homeless services",
  "rough sleepers",
];

// ─── Fetch ────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "OpenBenefacts research bot (contact@openbenefacts.com)",
        "Accept": "application/json",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    }).on("error", reject);
  });
}

// ─── Oireachtas API wrapper ──────────────────────────────────
// Docs: https://api.oireachtas.ie/
// Written questions endpoint: /v1/questions
async function searchPQs(topic, limit = 100, skip = 0) {
  // Use the debates search endpoint which also covers written PQs
  const url = `https://api.oireachtas.ie/v1/debates?chamber_type=house&chamber=dail&debate_type=question&date_start=2023-01-01&date_end=${new Date().toISOString().slice(0,10)}&q=${encodeURIComponent(topic)}&limit=${limit}&skip=${skip}`;
  const { status, json } = await fetchJson(url);
  return { status, results: json?.results || [] };
}

// ─── Provider name extraction ────────────────────────────────
// Matches capitalised multi-word sequences adjacent to accommodation keywords
// or Irish company suffixes (Ltd, Limited, CLG, DAC, Plc, Hotel, Apartments).
const PROVIDER_PATTERNS = [
  // Hotel/B&B/Hostel/Apartments names: "The Regency Hotel", "Travelodge Dublin"
  /\b([A-Z][A-Za-z'&\-]+(?:\s+[A-Z][A-Za-z'&\-]+){0,4})\s+(Hotel|Hotels|B\s*&\s*B|Hostel|Apartments|Apart-Hotel|Lodge|Inn|House|Suites|Residence|Accommodation)\b/g,
  // Company names with Irish suffixes
  /\b([A-Z][A-Za-z'&\-]+(?:\s+[A-Z][A-Za-z'&\-]+){0,4})\s+(Ltd\.?|Limited|CLG|DAC|Plc\.?|Unlimited)\b/g,
  // "operated by X" / "run by X"
  /\b(?:operated|run|managed|owned)\s+by\s+([A-Z][A-Za-z'&\-]+(?:\s+[A-Z][A-Za-z'&\-]+){0,5})/g,
];

// Known non-provider proper nouns we should filter out
const BLACKLIST = new Set([
  "Department of Housing", "Local Government", "Dublin City Council", "Dublin Region",
  "Cork City Council", "Deputy", "Minister", "Government", "State", "Ireland",
  "Oireachtas", "Dáil", "Dail", "Seanad", "Committee", "Focus Ireland", "Peter McVerry Trust", // (charities — we still record them but flag as charity)
  "The Minister", "The Department", "The State", "The Government",
]);

function extractProviders(text) {
  const found = new Set();
  for (const re of PROVIDER_PATTERNS) {
    let m;
    const rx = new RegExp(re.source, "g");
    while ((m = rx.exec(text)) !== null) {
      const name = `${m[1]}${m[2] ? " " + m[2] : ""}`.replace(/\s+/g, " ").trim();
      if (BLACKLIST.has(name)) continue;
      if (name.length < 6) continue;
      found.add(name);
    }
  }
  return [...found];
}

// Extract € values near provider mention (within 200 chars)
function extractValuesNear(text, providerName) {
  const idx = text.indexOf(providerName);
  if (idx < 0) return [];
  const window = text.slice(Math.max(0, idx - 200), Math.min(text.length, idx + 400));
  const values = [];
  const rx = /€\s*([\d,]+(?:\.\d+)?)\s*(million|m\b|billion|bn|thousand|k\b)?/gi;
  let m;
  while ((m = rx.exec(window)) !== null) {
    let v = parseFloat(m[1].replace(/,/g, ""));
    const mult = (m[2] || "").toLowerCase();
    if (/million|^m$/.test(mult)) v *= 1_000_000;
    else if (/billion|bn/.test(mult)) v *= 1_000_000_000;
    else if (/thousand|^k$/.test(mult)) v *= 1_000;
    values.push(Math.round(v));
  }
  return values;
}

// ─── LA normaliser (shared logic, simplified) ────────────────
const LA_RE = [
  [/dublin\s*city/i, "Dublin City Council", "Dublin Region"],
  [/d[uú]n\s*laoghaire/i, "Dún Laoghaire-Rathdown County Council", "Dublin Region"],
  [/fingal/i, "Fingal County Council", "Dublin Region"],
  [/south\s*dublin/i, "South Dublin County Council", "Dublin Region"],
  [/cork\s*city/i, "Cork City Council", "South"],
  [/cork\s*county/i, "Cork County Council", "South"],
  [/limerick/i, "Limerick City & County Council", "Mid-West"],
  [/galway\s*city/i, "Galway City Council", "West"],
  [/waterford/i, "Waterford City & County Council", "South-East"],
];
function classifyLA(text) {
  for (const [re, la, region] of LA_RE) if (re.test(text)) return { la, region };
  return { la: null, region: null };
}

// ─── Fetch PQ full text ──────────────────────────────────────
async function fetchPQText(uri) {
  const url = `https://api.oireachtas.ie/v1/debates?debate_id=${encodeURIComponent(uri)}&format=text`;
  const { json, raw } = await fetchJson(url);
  if (json?.results?.[0]?.debateRecord?.debateSections) {
    return json.results[0].debateRecord.debateSections
      .map(s => s.debateSection?.speeches?.map(sp => sp.speech?.content || "").join("\n") || "")
      .join("\n");
  }
  return raw || "";
}

// ─── Upsert ──────────────────────────────────────────────────
async function upsertProvider(name, ctx) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const { data: existing } = await supabase
    .from("emergency_providers")
    .select("id, source_count, total_known_revenue_eur")
    .ilike("name", cleanName)
    .eq("local_authority", ctx.la || "")
    .maybeSingle();

  if (existing) {
    await supabase.from("emergency_providers").update({
      source_count: (existing.source_count || 0) + 1,
      last_seen_date: ctx.date,
    }).eq("id", existing.id);
    return existing.id;
  }

  const type = /hotel/i.test(cleanName)     ? "Hotel"
            : /b\s*&\s*b/i.test(cleanName)  ? "B&B"
            : /hostel/i.test(cleanName)     ? "Hostel"
            : /apartments?/i.test(cleanName) ? "Apartments"
            : /ltd|limited|clg|dac|plc/i.test(cleanName) ? "Company"
            : "Unknown";

  const { data, error } = await supabase.from("emergency_providers").insert({
    name: cleanName,
    provider_type: type,
    region: ctx.region,
    local_authority: ctx.la,
    first_seen_date: ctx.date,
    last_seen_date: ctx.date,
    source_count: 1,
  }).select("id").single();

  if (error) { console.warn(`  ! ${error.message}`); return null; }
  return data.id;
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("\n📜 OpenBenefacts — Oireachtas PQ provider scraper");
  console.log("=".repeat(60));

  const seenPQs = new Set();
  let totalProviders = 0, totalContracts = 0;

  for (const topic of TOPICS) {
    console.log(`\n🔍 topic: "${topic}"`);
    const { status, results } = await searchPQs(topic);
    if (status !== 200) { console.warn(`  ! HTTP ${status}`); continue; }
    console.log(`  found ${results.length} debates`);

    for (const r of results) {
      const uri = r.debateRecord?.uri || r.uri;
      if (!uri || seenPQs.has(uri)) continue;
      seenPQs.add(uri);

      const date = r.debateRecord?.date || r.date;
      const text = await fetchPQText(uri);
      await new Promise(res => setTimeout(res, 400));

      if (!text || text.length < 100) continue;

      const providers = extractProviders(text);
      if (!providers.length) continue;

      console.log(`  📄 ${date} — ${providers.length} providers`);

      for (const name of providers) {
        const { la, region } = classifyLA(text.slice(Math.max(0, text.indexOf(name) - 300), text.indexOf(name) + 300));
        const values = extractValuesNear(text, name);
        const maxVal = values.length ? Math.max(...values) : null;

        const providerId = await upsertProvider(name, { la, region, date });
        if (providerId) totalProviders++;

        if (maxVal && maxVal > 10_000) {
          const ref = `oireachtas_${uri.replace(/[^a-z0-9]/gi, "_")}_${name.slice(0,20).replace(/\s/g,"_")}`;
          await supabase.from("provider_contracts").upsert({
            provider_id: providerId,
            provider_name_raw: name,
            awarding_body: la || "Department of Housing",
            local_authority: la,
            region,
            contract_title: `PQ reference — ${topic}`,
            value_eur: maxVal,
            award_date: date,
            source_type: "oireachtas_pq",
            source_url: `https://www.oireachtas.ie/en/debates/${uri}`,
            source_reference: ref.slice(0, 200),
            description: `Mentioned in parliamentary question on ${topic}`,
          }, { onConflict: "source_type,source_reference" });
          totalContracts++;
        }
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Providers touched: ${totalProviders}`);
  console.log(`✅ Contracts recorded: ${totalContracts}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });

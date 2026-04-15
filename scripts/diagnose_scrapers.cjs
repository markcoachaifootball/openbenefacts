#!/usr/bin/env node
/**
 * diagnose_scrapers.cjs
 * ============================================================
 * Diagnostic: dump what eTenders and Oireachtas APIs actually
 * return so we can write correct parsers.
 * ============================================================
 */
"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (OpenBenefacts diagnostic)",
        "Accept": "text/html,application/json",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data, url, headers: res.headers }));
    }).on("error", reject);
  });
}

async function main() {
  const outDir = path.join(__dirname, "..", "data", "diagnostic");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("\n🔎 Diagnostic: fetching real responses\n" + "=".repeat(60));

  // ── 1. eTenders quickSearch ────────────────────────────────
  const eTendersUrl = "https://www.etenders.gov.ie/epps/quickSearchAction.do?searchSpace=all&latest=false&searchValue=emergency+accommodation";
  console.log(`\n[1] eTenders: ${eTendersUrl}`);
  try {
    const r = await fetchUrl(eTendersUrl);
    console.log(`    status=${r.status} bytes=${r.body.length}`);
    console.log(`    content-type=${r.headers["content-type"]}`);
    fs.writeFileSync(path.join(outDir, "etenders.html"), r.body);
    // Show first 1500 chars of body
    console.log(`    preview: ${r.body.slice(0, 500).replace(/\s+/g, " ")}…`);
  } catch (e) { console.error(`    ERR: ${e.message}`); }

  // ── 2. Oireachtas debates API ──────────────────────────────
  const oirUrl = "https://api.oireachtas.ie/v1/debates?chamber_type=house&chamber=dail&debate_type=question&date_start=2024-01-01&date_end=2025-12-31&q=emergency%20accommodation&limit=3&skip=0";
  console.log(`\n[2] Oireachtas debates search: ${oirUrl}`);
  try {
    const r = await fetchUrl(oirUrl);
    console.log(`    status=${r.status} bytes=${r.body.length}`);
    fs.writeFileSync(path.join(outDir, "oireachtas-search.json"), r.body);
    const json = JSON.parse(r.body);
    console.log(`    result head count: ${json?.head?.counts?.resultCount}`);
    console.log(`    results returned: ${json?.results?.length}`);
    if (json?.results?.[0]) {
      console.log(`    first result keys: ${Object.keys(json.results[0]).join(", ")}`);
      if (json.results[0].contextDate) console.log(`    contextDate: ${json.results[0].contextDate}`);
      if (json.results[0].debateRecord) console.log(`    debateRecord keys: ${Object.keys(json.results[0].debateRecord).join(", ")}`);
    }
  } catch (e) { console.error(`    ERR: ${e.message}`); }

  // ── 3. Oireachtas debates fetch-by-id (sample) ─────────────
  // Grab first result URI from above, then try to fetch its text
  try {
    const search = JSON.parse(fs.readFileSync(path.join(outDir, "oireachtas-search.json"), "utf8"));
    const first = search?.results?.[0]?.debateRecord;
    if (first?.uri) {
      const detailUrl = `https://api.oireachtas.ie/v1/debates?debate_id=${encodeURIComponent(first.uri)}`;
      console.log(`\n[3] Oireachtas debate detail: ${detailUrl}`);
      const r = await fetchUrl(detailUrl);
      console.log(`    status=${r.status} bytes=${r.body.length}`);
      fs.writeFileSync(path.join(outDir, "oireachtas-detail.json"), r.body);
      const json = JSON.parse(r.body);
      // Try to find actual text content somewhere
      const str = JSON.stringify(json);
      const hasEmergency = str.includes("emergency accommodation") || str.includes("Emergency Accommodation");
      console.log(`    mentions 'emergency accommodation': ${hasEmergency}`);
      console.log(`    top-level keys: ${Object.keys(json).join(", ")}`);
      if (json.head) console.log(`    head keys: ${Object.keys(json.head).join(", ")}`);
      if (json.results?.[0]) console.log(`    results[0] keys: ${Object.keys(json.results[0]).join(", ")}`);
    } else {
      console.log(`\n[3] no first result to fetch detail for`);
    }
  } catch (e) { console.error(`    ERR: ${e.message}`); }

  // ── 4. Oireachtas: try the 'questions' endpoint directly ───
  const qUrl = "https://api.oireachtas.ie/v1/questions?date_start=2024-01-01&date_end=2025-12-31&chamber=dail&q=emergency%20accommodation&limit=3";
  console.log(`\n[4] Oireachtas questions: ${qUrl}`);
  try {
    const r = await fetchUrl(qUrl);
    console.log(`    status=${r.status} bytes=${r.body.length}`);
    fs.writeFileSync(path.join(outDir, "oireachtas-questions.json"), r.body);
    if (r.status === 200) {
      const json = JSON.parse(r.body);
      console.log(`    result count: ${json?.head?.counts?.resultCount || json?.results?.length || 0}`);
      if (json.results?.[0]) {
        console.log(`    first result keys: ${Object.keys(json.results[0]).join(", ")}`);
        console.log(`    first result sample:\n${JSON.stringify(json.results[0], null, 2).slice(0, 1500)}`);
      }
    }
  } catch (e) { console.error(`    ERR: ${e.message}`); }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Outputs saved to: ${outDir}`);
  console.log(`Files:\n  - etenders.html\n  - oireachtas-search.json\n  - oireachtas-detail.json\n  - oireachtas-questions.json`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

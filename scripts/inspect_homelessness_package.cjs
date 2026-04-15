#!/usr/bin/env node
/**
 * inspect_homelessness_package.cjs
 * ============================================================
 * Diagnostic: lists every resource in data.gov.ie's
 * homelessness-report package so we can identify which file
 * contains LA-level (vs regional) data.
 *
 * Run:   node scripts/inspect_homelessness_package.cjs
 * ============================================================
 */
"use strict";
const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

async function main() {
  console.log("\n📦 Inspecting data.gov.ie — homelessness-report package");
  console.log("=".repeat(60));

  // Also try a broad search for any package with "homelessness" in the title
  const searches = [
    "https://data.gov.ie/api/3/action/package_show?id=homelessness-report",
    "https://data.gov.ie/api/3/action/package_search?q=homelessness&rows=20",
  ];

  for (const url of searches) {
    console.log(`\n🔎 ${url}\n${"─".repeat(60)}`);
    try {
      const { body } = await fetchUrl(url);
      const json = JSON.parse(body);

      const packages = url.includes("package_show")
        ? [json.result].filter(Boolean)
        : (json.result?.results || []);

      if (!packages.length) { console.log("  (no packages)"); continue; }

      for (const pkg of packages) {
        console.log(`\n📦 PACKAGE: ${pkg.title}`);
        console.log(`   id: ${pkg.name}`);
        console.log(`   modified: ${pkg.metadata_modified}`);
        console.log(`   resources: ${(pkg.resources || []).length}`);

        for (const r of (pkg.resources || [])) {
          console.log(`\n     📄 ${r.name || "(no name)"}`);
          console.log(`        format:   ${r.format}`);
          console.log(`        modified: ${r.last_modified || r.created}`);
          console.log(`        url:      ${r.url}`);
          if (r.description) {
            console.log(`        desc:     ${r.description.slice(0, 140)}`);
          }
        }
      }
    } catch (e) {
      console.error(`  ❌ ${e.message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}\nDone. Copy this output and send it back.\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

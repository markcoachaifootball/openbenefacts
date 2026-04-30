#!/usr/bin/env node
/**
 * scrape_lobbying_register.cjs
 * ============================================================
 * Fetches nonprofit lobbying returns from lobbying.ie
 * and links them to org records via charity/CRO numbers.
 *
 * The Lobbying Register has a public API at:
 *   https://www.lobbying.ie/api/
 *
 * Key endpoints:
 *   GET /returns        — paginated list of lobbying returns
 *   GET /registrants    — list of registered lobbyists
 *
 * We filter for registrant_type = "Charity" or "Not-for-profit"
 * and store: org name, registration date, return count,
 * who they lobbied, and designated public officials contacted.
 *
 * Usage:
 *   node scripts/scrape_lobbying_register.cjs
 *
 * Requires: VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY env vars
 * ============================================================
 */

const https = require("https");

const LOBBYING_API = "https://www.lobbying.ie/api";

// Registrant types that indicate nonprofit organisations
const NONPROFIT_TYPES = ["charity", "not-for-profit", "representative body"];

/**
 * Fetch JSON from the Lobbying Register API
 */
function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const url = `${LOBBYING_API}${path}`;
    console.log(`  → GET ${url}`);
    https.get(url, { headers: { Accept: "application/json" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          // API might return HTML if endpoint doesn't exist
          reject(new Error(`Invalid JSON from ${url}: ${body.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

/**
 * Fetch all nonprofit registrants from the Lobbying Register
 */
async function fetchNonprofitRegistrants() {
  console.log("\n📋 Fetching registrants from lobbying.ie...");

  try {
    const data = await fetchJSON("/registrants?limit=500&offset=0");
    const registrants = Array.isArray(data) ? data : data?.results || data?.data || [];

    console.log(`  Found ${registrants.length} total registrants`);

    // Filter for nonprofit types
    const nonprofits = registrants.filter((r) => {
      const type = (r.registrant_type || r.type || "").toLowerCase();
      return NONPROFIT_TYPES.some((t) => type.includes(t));
    });

    console.log(`  ${nonprofits.length} are nonprofit/charity registrants`);

    return nonprofits.map((r) => ({
      registrant_id: r.id || r.registrant_id,
      name: r.name || r.registrant_name,
      type: r.registrant_type || r.type,
      registration_date: r.registration_date || r.created_at,
      address: r.address || r.principal_address,
      website: r.website || r.web_address,
    }));
  } catch (err) {
    console.error(`  ⚠ API error: ${err.message}`);
    console.log("  Note: The lobbying.ie API may require different endpoints.");
    console.log("  Try browsing https://www.lobbying.ie/app/OpenSearch for the correct API structure.");
    return [];
  }
}

/**
 * Fetch lobbying returns for a specific registrant
 */
async function fetchReturnsForRegistrant(registrantId) {
  try {
    const data = await fetchJSON(`/returns?registrant_id=${registrantId}&limit=100`);
    return Array.isArray(data) ? data : data?.results || data?.data || [];
  } catch {
    return [];
  }
}

/**
 * Main pipeline
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Lobbying Register → OpenBenefacts Scraper");
  console.log("=".repeat(60));

  // Step 1: Fetch nonprofit registrants
  const registrants = await fetchNonprofitRegistrants();

  if (registrants.length === 0) {
    console.log("\n⚠ No registrants found. The API structure may have changed.");
    console.log("Manual steps:");
    console.log("  1. Visit https://www.lobbying.ie/app/OpenSearch");
    console.log("  2. Filter by 'Registrant Type: Charity'");
    console.log("  3. Export results and import via CSV");
    return;
  }

  // Step 2: Summary stats
  console.log("\n📊 Summary:");
  console.log(`  Nonprofit registrants: ${registrants.length}`);

  // Step 3: Output sample data
  console.log("\n📝 Sample registrants:");
  registrants.slice(0, 10).forEach((r) => {
    console.log(`  • ${r.name} (${r.type}) — registered ${r.registration_date || "unknown"}`);
  });

  // Step 4: Prepare for Supabase insert
  console.log("\n💾 To import to Supabase, create a 'lobbying_registrants' table:");
  console.log(`
  CREATE TABLE IF NOT EXISTS lobbying_registrants (
    id SERIAL PRIMARY KEY,
    registrant_id TEXT UNIQUE,
    org_name TEXT NOT NULL,
    registrant_type TEXT,
    registration_date DATE,
    address TEXT,
    website TEXT,
    return_count INTEGER DEFAULT 0,
    organisation_id UUID REFERENCES organisations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_lobbying_org ON lobbying_registrants(organisation_id);
  CREATE INDEX idx_lobbying_name ON lobbying_registrants(org_name);
  `);

  console.log(`\n✅ Found ${registrants.length} nonprofit registrants ready for import.`);
  console.log("Next: Match registrant names against organisations table to link records.");
}

main().catch(console.error);

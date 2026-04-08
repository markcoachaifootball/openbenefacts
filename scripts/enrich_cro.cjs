/**
 * OpenBenefacts CRO Enrichment Script
 *
 * Fetches company data from the CRO Open Data Portal (opendata.cro.ie)
 * and enriches our organisations table with:
 * - Company type (CLG, DAC, etc.)
 * - Company status (Normal, Dissolved, etc.)
 * - Registration date
 * - Dissolved date (if applicable)
 *
 * Also identifies CLGs/DACs in the CRO register that we're missing.
 *
 * API: CKAN DataStore (free, no auth required)
 * Resource: 3fef41bc-b8f4-4b10-8434-ce51c29b1bba (Company Records)
 *
 * Run: node scripts/enrich_cro.cjs
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilkwspvhqedzjreysuxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZXrfyZGXM2KbBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CRO_API = 'https://opendata.cro.ie/api/3/action/datastore_search';
const CRO_SQL_API = 'https://opendata.cro.ie/api/3/action/datastore_search_sql';
const RESOURCE_ID = '3fef41bc-b8f4-4b10-8434-ce51c29b1bba';

// Nonprofit company types in CRO register
const NONPROFIT_TYPES = [
  'CLG - Company Limited by Guarantee',
  'CLG-Company Limited by Guarantee (licenced company)',
  'Guarantee company without a share capital (public)',
  'Guarantee',
  'Guarantee licence company w/o sh/capital (public)',
  'Guarantee licence',
  'DAC - Designated Activity Company (limited by guarantee)',
  'DAC- Designated Activity Company (limited by guarantee ) (licenced company)',
  'Private limited by guarantee',
  'Private guarantee with share capital',
  'Single member company ltd by g/tee with sh/cap',
];

// ============================================================
// CRO API helpers
// ============================================================
async function fetchCROPage(offset, limit = 1000) {
  const url = `${CRO_API}?resource_id=${RESOURCE_ID}&limit=${limit}&offset=${offset}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CRO API error: ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error('CRO API returned unsuccessful');
  return data.result;
}

async function fetchCROByCompanyNum(companyNum) {
  const sql = `SELECT * FROM "${RESOURCE_ID}" WHERE company_num = ${companyNum}`;
  const url = `${CRO_SQL_API}?sql=${encodeURIComponent(sql)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.success || !data.result.records.length) return null;
  return data.result.records[0];
}

async function fetchCRONonprofits(offset, limit = 1000) {
  const typeList = NONPROFIT_TYPES.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT * FROM "${RESOURCE_ID}" WHERE company_type IN (${typeList}) AND company_status != 'Dissolved' ORDER BY company_num LIMIT ${limit} OFFSET ${offset}`;
  const url = `${CRO_SQL_API}?sql=${encodeURIComponent(sql)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CRO SQL API error: ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error('CRO SQL API returned unsuccessful');
  return data.result.records;
}

// ============================================================
// Load our organisations with CRO numbers
// ============================================================
async function getOurOrgsWithCRO() {
  console.log('Loading organisations with CRO numbers...');
  let allOrgs = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, cro_number, charity_number, governing_form, county')
      .not('cro_number', 'is', null)
      .neq('cro_number', '')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrgs = allOrgs.concat(data);
    page++;
    if (data.length < pageSize) break;
  }
  console.log(`Found ${allOrgs.length} organisations with CRO numbers`);
  return allOrgs;
}

async function getAllOrgNames() {
  console.log('Loading all organisation names for matching...');
  let allOrgs = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, cro_number')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrgs = allOrgs.concat(data);
    page++;
    if (data.length < pageSize) break;
  }
  const byName = {};
  const byCro = {};
  allOrgs.forEach(o => {
    byName[o.name.toUpperCase().trim()] = o.id;
    if (o.cro_number) byCro[String(o.cro_number)] = o.id;
  });
  return { byName, byCro, total: allOrgs.length };
}

// ============================================================
// STEP 1: Enrich existing orgs with CRO data
// ============================================================
async function enrichExistingOrgs(ourOrgs) {
  console.log('\n=== STEP 1: Enriching existing orgs with CRO data ===');

  let enriched = 0;
  let notFound = 0;
  let errors = 0;
  const batchSize = 10; // Rate-limit friendly

  for (let i = 0; i < ourOrgs.length; i += batchSize) {
    const batch = ourOrgs.slice(i, i + batchSize);

    const promises = batch.map(async (org) => {
      try {
        const croNum = parseInt(org.cro_number);
        if (isNaN(croNum)) return null;

        const croData = await fetchCROByCompanyNum(croNum);
        if (!croData) { notFound++; return null; }

        // Update our org with CRO data
        const updates = {};
        if (croData.company_type) updates.cro_company_type = croData.company_type;
        if (croData.company_status) updates.cro_company_status = croData.company_status;
        if (croData.company_reg_date) updates.date_incorporated = croData.company_reg_date.split('T')[0];

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('organisations')
            .update(updates)
            .eq('id', org.id);
          if (error) {
            // Fields might not exist yet - track for later
            if (error.message.includes('column')) {
              return { needsColumns: true, updates };
            }
            errors++;
          } else {
            enriched++;
          }
        }
        return { enriched: true };
      } catch (e) {
        errors++;
        return null;
      }
    });

    const results = await Promise.all(promises);

    // Check if we need to add columns
    const needsCols = results.find(r => r?.needsColumns);
    if (needsCols) {
      console.log('\n  NOTE: Need to add CRO columns to organisations table.');
      console.log('  Run this SQL in Supabase:');
      console.log('  ALTER TABLE organisations ADD COLUMN IF NOT EXISTS cro_company_type text;');
      console.log('  ALTER TABLE organisations ADD COLUMN IF NOT EXISTS cro_company_status text;');
      console.log('  Then re-run this script.\n');
      return { enriched, notFound, errors, needsColumns: true };
    }

    if ((i + batchSize) % 100 === 0 || i + batchSize >= ourOrgs.length) {
      console.log(`  Progress: ${Math.min(i + batchSize, ourOrgs.length)}/${ourOrgs.length} (enriched: ${enriched}, not found: ${notFound})`);
    }

    // Small delay to be polite to the API
    if (i + batchSize < ourOrgs.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { enriched, notFound, errors, needsColumns: false };
}

// ============================================================
// STEP 2: Find nonprofit CLGs/DACs we're missing
// ============================================================
async function findMissingNonprofits(orgLookup) {
  console.log('\n=== STEP 2: Finding nonprofit CLGs/DACs we may be missing ===');

  let offset = 0;
  let totalCRO = 0;
  let alreadyHave = 0;
  let missing = [];

  while (true) {
    let records;
    try {
      records = await fetchCRONonprofits(offset, 1000);
    } catch (e) {
      console.log(`  API error at offset ${offset}: ${e.message}`);
      break;
    }

    if (!records || records.length === 0) break;
    totalCRO += records.length;

    for (const rec of records) {
      const croNum = String(rec.company_num);
      const name = (rec.company_name || '').toUpperCase().trim();

      if (orgLookup.byCro[croNum] || orgLookup.byName[name]) {
        alreadyHave++;
      } else {
        missing.push({
          company_num: rec.company_num,
          company_name: rec.company_name,
          company_type: rec.company_type,
          company_status: rec.company_status,
          reg_date: rec.company_reg_date,
          address: [rec.company_address_1, rec.company_address_2, rec.company_address_3, rec.company_address_4].filter(Boolean).join(', '),
        });
      }
    }

    console.log(`  Fetched ${totalCRO} CRO nonprofits (already have: ${alreadyHave}, missing: ${missing.length})`);
    offset += records.length;

    // Small delay
    await new Promise(r => setTimeout(r, 300));

    if (records.length < 1000) break;
  }

  return { totalCRO, alreadyHave, missing };
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('=== OpenBenefacts CRO Enrichment ===\n');

  // Step 1: Enrich existing orgs
  const ourOrgs = await getOurOrgsWithCRO();

  if (ourOrgs.length > 0) {
    const result = await enrichExistingOrgs(ourOrgs);
    console.log(`\nStep 1 Results:`);
    console.log(`  Enriched: ${result.enriched}`);
    console.log(`  Not found in CRO: ${result.notFound}`);
    console.log(`  Errors: ${result.errors}`);

    if (result.needsColumns) {
      console.log('\n⚠️  Please add the missing columns and re-run.');
      return;
    }
  }

  // Step 2: Find missing nonprofits
  const orgLookup = await getAllOrgNames();
  const missing = await findMissingNonprofits(orgLookup);

  console.log(`\nStep 2 Results:`);
  console.log(`  Active nonprofit CLGs/DACs in CRO: ${missing.totalCRO}`);
  console.log(`  Already in our database: ${missing.alreadyHave}`);
  console.log(`  Missing from our database: ${missing.missing.length}`);

  // Show top 20 missing by name
  if (missing.missing.length > 0) {
    console.log(`\n--- Sample Missing Nonprofits (first 30) ---`);
    missing.missing.slice(0, 30).forEach(m => {
      console.log(`  ${m.company_name} (CRO ${m.company_num}) - ${m.company_type} - ${m.company_status}`);
    });

    if (missing.missing.length > 30) {
      console.log(`  ... and ${missing.missing.length - 30} more`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('CRO ENRICHMENT COMPLETE');
  console.log('='.repeat(50));
  console.log(`Orgs enriched with CRO data: ${ourOrgs.length > 0 ? 'see above' : 'none (no CRO numbers)'}`);
  console.log(`Missing nonprofits found: ${missing.missing.length}`);
  console.log(`These could be added to expand the database.`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

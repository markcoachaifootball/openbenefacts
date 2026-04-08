/**
 * OpenBenefacts CRO Nonprofit Importer
 *
 * Imports ~9,900 missing nonprofit CLGs/DACs from the CRO Open Data Portal
 * into the organisations table. These are companies registered as guarantee
 * companies that aren't already in our database from the Charities Register.
 *
 * Run: node scripts/import_cro_nonprofits.cjs
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilkwspvhqedzjreysuxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZXrfyZGXM2KbBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CRO_SQL_API = 'https://opendata.cro.ie/api/3/action/datastore_search_sql';
const RESOURCE_ID = '3fef41bc-b8f4-4b10-8434-ce51c29b1bba';

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

// Map CRO company type to a simpler governing_form
function mapGoverningForm(croType) {
  if (croType.startsWith('CLG')) return 'CLG';
  if (croType.startsWith('DAC')) return 'DAC';
  if (croType.includes('Guarantee')) return 'CLG';
  return 'Other';
}

// Extract county from CRO address fields
function extractCounty(addr1, addr2, addr3, addr4) {
  const parts = [addr4, addr3, addr2, addr1].filter(Boolean);
  const fullAddr = parts.join(' ').toUpperCase();

  const counties = [
    'CARLOW','CAVAN','CLARE','CORK','DONEGAL','DUBLIN','GALWAY',
    'KERRY','KILDARE','KILKENNY','LAOIS','LEITRIM','LIMERICK',
    'LONGFORD','LOUTH','MAYO','MEATH','MONAGHAN','OFFALY',
    'ROSCOMMON','SLIGO','TIPPERARY','WATERFORD','WESTMEATH',
    'WEXFORD','WICKLOW'
  ];

  for (const c of counties) {
    if (fullAddr.includes(c)) return c;
  }

  // Check for Dublin variants
  if (fullAddr.match(/DUBLIN\s*\d+/)) return 'DUBLIN';
  if (fullAddr.includes('DUBLIN')) return 'DUBLIN';

  return null;
}

// Guess sector from company name
function guessSector(name) {
  const n = name.toUpperCase();
  if (n.includes('SCHOOL') || n.includes('EDUCATION') || n.includes('COLLEGE') || n.includes('ACADEMY')) return 'Education';
  if (n.includes('HOSPITAL') || n.includes('HEALTH') || n.includes('MEDICAL') || n.includes('CARE')) return 'Health';
  if (n.includes('HOUSING') || n.includes('HOMELESS')) return 'Social Services';
  if (n.includes('SPORT') || n.includes('GAA') || n.includes('FOOTBALL') || n.includes('RUGBY') || n.includes('SOCCER') || n.includes('ATHLETIC')) return 'Sports & Recreation';
  if (n.includes('CHURCH') || n.includes('PARISH') || n.includes('DIOCESE') || n.includes('CHRISTIAN') || n.includes('MOSQUE') || n.includes('SYNAGOGUE')) return 'Religion';
  if (n.includes('COMMUNITY') || n.includes('RESIDENTS') || n.includes('NEIGHBOURHOOD')) return 'Community Development';
  if (n.includes('ART') || n.includes('THEATRE') || n.includes('MUSIC') || n.includes('FESTIVAL') || n.includes('GALLERY') || n.includes('CULTURAL')) return 'Arts & Culture';
  if (n.includes('CHARITY') || n.includes('TRUST') || n.includes('FOUNDATION') || n.includes('FUND')) return 'Philanthropy';
  if (n.includes('ENVIRONMENT') || n.includes('CONSERVATION') || n.includes('WILDLIFE') || n.includes('GREEN')) return 'Environment';
  if (n.includes('PENSION') || n.includes('RETIREMENT')) return 'Pensions';
  if (n.includes('TRADE') || n.includes('BUSINESS') || n.includes('CHAMBER') || n.includes('INDUSTRY')) return 'Business & Trade';
  return null;
}

// ============================================================
// Load existing org lookup
// ============================================================
async function getExistingOrgLookup() {
  console.log('Loading existing organisations...');
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
  console.log(`Loaded ${allOrgs.length} existing organisations`);
  return { byName, byCro, total: allOrgs.length };
}

// ============================================================
// Fetch CRO nonprofits
// ============================================================
async function fetchCRONonprofits(offset, limit = 1000) {
  const typeList = NONPROFIT_TYPES.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT * FROM "${RESOURCE_ID}" WHERE company_type IN (${typeList}) AND company_status != 'Dissolved' ORDER BY company_num LIMIT ${limit} OFFSET ${offset}`;
  const url = `${CRO_SQL_API}?sql=${encodeURIComponent(sql)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CRO API error: ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error('CRO API unsuccessful');
  return data.result.records;
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('=== CRO Nonprofit Importer ===\n');

  const lookup = await getExistingOrgLookup();

  // Fetch all CRO nonprofits and find missing ones
  console.log('\nFetching CRO nonprofit records...');
  let offset = 0;
  let missing = [];
  let totalFetched = 0;
  let alreadyHave = 0;

  while (true) {
    let records;
    try {
      records = await fetchCRONonprofits(offset, 1000);
    } catch (e) {
      console.log(`API error at offset ${offset}: ${e.message}`);
      break;
    }
    if (!records || records.length === 0) break;
    totalFetched += records.length;

    for (const rec of records) {
      const croNum = String(rec.company_num);
      const name = (rec.company_name || '').toUpperCase().trim();

      if (lookup.byCro[croNum] || lookup.byName[name]) {
        alreadyHave++;
        continue;
      }

      const county = extractCounty(rec.company_address_1, rec.company_address_2, rec.company_address_3, rec.company_address_4);
      const address = [rec.company_address_1, rec.company_address_2, rec.company_address_3].filter(Boolean).join(', ');
      const sector = guessSector(rec.company_name || '');
      const govForm = mapGoverningForm(rec.company_type || '');
      const regDate = rec.company_reg_date ? rec.company_reg_date.split('T')[0] : null;

      missing.push({
        name: rec.company_name,
        name_normalised: name,
        cro_number: croNum,
        governing_form: govForm,
        county: county,
        address: address,
        sector: sector,
        date_incorporated: regDate,
        status: 'active',
        cro_company_type: rec.company_type,
        cro_company_status: rec.company_status,
      });
    }

    console.log(`  Fetched ${totalFetched} (already have: ${alreadyHave}, new: ${missing.length})`);
    offset += records.length;
    await new Promise(r => setTimeout(r, 300));
    if (records.length < 1000) break;
  }

  console.log(`\nTotal CRO nonprofits: ${totalFetched}`);
  console.log(`Already in database: ${alreadyHave}`);
  console.log(`New to import: ${missing.length}`);

  if (missing.length === 0) {
    console.log('Nothing to import!');
    return;
  }

  // Sector breakdown
  const sectorCounts = {};
  missing.forEach(m => {
    const s = m.sector || 'Uncategorised';
    sectorCounts[s] = (sectorCounts[s] || 0) + 1;
  });
  console.log('\nNew orgs by sector:');
  Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`  ${s}: ${c}`);
  });

  // County breakdown
  const countyCounts = {};
  missing.forEach(m => {
    const c = m.county || 'Unknown';
    countyCounts[c] = (countyCounts[c] || 0) + 1;
  });
  console.log('\nTop counties:');
  Object.entries(countyCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => {
    console.log(`  ${c}: ${n}`);
  });

  // Insert in batches
  console.log('\n--- Inserting new organisations ---');
  const batchSize = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const { error } = await supabase.from('organisations').insert(batch);

    if (error) {
      // Try one by one
      for (const row of batch) {
        const { error: rowErr } = await supabase.from('organisations').insert(row);
        if (rowErr) {
          errors++;
          if (errors <= 5) console.error(`  Error: ${rowErr.message} (${row.name})`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= missing.length) {
      console.log(`  Progress: ${Math.min(i + batchSize, missing.length)}/${missing.length} (inserted: ${inserted})`);
    }
  }

  // Update platform stats view if it exists
  console.log('\nUpdating platform stats...');
  const { count } = await supabase.from('organisations').select('*', { count: 'exact', head: true });
  console.log(`Total organisations now: ${count}`);

  console.log('\n' + '='.repeat(50));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(50));
  console.log(`New organisations added: ${inserted}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total orgs in database: ${count}`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Import Unmatched Charities from the Charities Regulator Register
 *
 * Takes charities from the register CSV that don't already exist in the
 * organisations table and adds them. Then re-links their directors.
 *
 * Run: node scripts/import_unmatched_charities.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ilkwspvhqedzjreysuxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZXrfyZGXM2KbBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// CSV parser (handles multiline quoted fields)
// ============================================================
function parseCSV(text) {
  const rows = [];
  let current = '';
  let fields = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        fields.push(current.trim());
        if (fields.length > 1 || fields[0] !== '') rows.push(fields);
        fields = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  if (fields.length > 1 || fields[0] !== '') rows.push(fields);
  return rows;
}

// ============================================================
// Helpers
// ============================================================
function normaliseCharityNum(num) {
  if (!num) return '';
  return String(num).replace(/^(RCN|CHY|CRA)\s*/i, '').replace(/\s+/g, '').replace(/^0+/, '').trim();
}

function normaliseOrgName(name) {
  if (!name) return '';
  return name.toUpperCase()
    .replace(/\b(LIMITED|LTD|CLG|DAC|DESIGNATED ACTIVITY COMPANY|COMPANY LIMITED BY GUARANTEE|T\/A|TRADING AS|THE)\b/g, '')
    .replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function extractCounty(address) {
  if (!address) return null;
  const counties = ['Carlow','Cavan','Clare','Cork','Donegal','Dublin','Galway','Kerry','Kildare','Kilkenny',
    'Laois','Leitrim','Limerick','Longford','Louth','Mayo','Meath','Monaghan','Offaly','Roscommon',
    'Sligo','Tipperary','Waterford','Westmeath','Wexford','Wicklow'];
  const upper = address.toUpperCase();
  for (const c of counties) {
    if (upper.includes(c.toUpperCase())) return c.toUpperCase();
  }
  return null;
}

function mapSector(classification) {
  if (!classification) return 'Other';
  const c = classification.toLowerCase();
  if (c.includes('education')) return 'Education, Research';
  if (c.includes('health')) return 'Health';
  if (c.includes('social')) return 'Social Services';
  if (c.includes('religion')) return 'Religion';
  if (c.includes('arts') || c.includes('culture') || c.includes('heritage')) return 'Arts, Culture, Heritage';
  if (c.includes('sport') || c.includes('recreation')) return 'Sport, Recreation';
  if (c.includes('community')) return 'Community Development';
  if (c.includes('environment')) return 'Environment';
  if (c.includes('human rights') || c.includes('equality')) return 'Human Rights, Equality';
  if (c.includes('housing')) return 'Housing';
  if (c.includes('international') || c.includes('overseas')) return 'International Development';
  if (c.includes('animal')) return 'Animal Welfare';
  return 'Other';
}

// ============================================================
// Load existing orgs for dedup
// ============================================================
async function getExistingLookup() {
  console.log('Loading existing organisations...');
  let allOrgs = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, charity_number, cro_number')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrgs = allOrgs.concat(data);
    page++;
    if (data.length < pageSize) break;
  }
  console.log(`Loaded ${allOrgs.length} existing organisations`);

  const byCharity = new Set();
  const byCharityNorm = new Set();
  const byName = new Set();
  const byNameFuzzy = new Set();

  allOrgs.forEach(o => {
    if (o.charity_number) {
      byCharity.add(String(o.charity_number).trim());
      byCharityNorm.add(normaliseCharityNum(o.charity_number));
    }
    if (o.name) {
      byName.add(o.name.toUpperCase().trim());
      byNameFuzzy.add(normaliseOrgName(o.name));
    }
  });

  return { byCharity, byCharityNorm, byName, byNameFuzzy, total: allOrgs.length };
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('=== Import Unmatched Charities ===\n');

  const existing = await getExistingLookup();

  // Read CSV
  const csvPath = path.join(__dirname, '..', 'openbenefacts_data', 'charities_register.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  console.log('\nParsing charities register CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const allRows = parseCSV(csvContent);
  console.log(`Parsed ${allRows.length} rows`);

  const headers = allRows[0];
  const col = {};
  headers.forEach((h, i) => { col[h.toLowerCase().trim()] = i; });

  const rcnIdx = headers.findIndex(h => h.toLowerCase().includes('registered charity number'));
  const nameIdx = headers.findIndex(h => h.toLowerCase().includes('registered charity name'));
  const akaIdx = headers.findIndex(h => h.toLowerCase().includes('also known as'));
  const statusIdx = headers.findIndex(h => h.toLowerCase().includes('status'));
  const classIdx = headers.findIndex(h => h.toLowerCase().includes('classification'));
  const addressIdx = headers.findIndex(h => h.toLowerCase().includes('primary address'));
  const govFormIdx = headers.findIndex(h => h.toLowerCase().includes('governing form'));
  const croIdx = headers.findIndex(h => h.toLowerCase().includes('cro number'));
  const purposeIdx = headers.findIndex(h => h.toLowerCase().includes('charitable purpose'));
  const objectsIdx = headers.findIndex(h => h.toLowerCase().includes('charitable objects'));
  const trusteesIdx = headers.findIndex(h => h.toLowerCase().includes('trustees'));

  console.log(`Column indices: rcn=${rcnIdx} name=${nameIdx} status=${statusIdx} class=${classIdx} address=${addressIdx} govForm=${govFormIdx} cro=${croIdx}`);

  // Find unmatched charities
  const newOrgs = [];
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (let i = 1; i < allRows.length; i++) {
    const f = allRows[i];
    const rcn = (f[rcnIdx] || '').trim();
    const name = (f[nameIdx] || '').trim();

    // Skip rows with no valid RCN (should be a number)
    if (!rcn || !/^\d+$/.test(rcn)) {
      skippedInvalid++;
      continue;
    }

    // Skip if already exists
    if (existing.byCharity.has(rcn) ||
        existing.byCharityNorm.has(normaliseCharityNum(rcn)) ||
        existing.byName.has(name.toUpperCase()) ||
        existing.byNameFuzzy.has(normaliseOrgName(name))) {
      skippedDuplicates++;
      continue;
    }

    const status = (f[statusIdx] || '').trim();
    const classification = (f[classIdx] || '').trim();
    const address = (f[addressIdx] || '').trim();
    const govForm = (f[govFormIdx] || '').trim();
    const croNum = (f[croIdx] || '').trim();
    const purpose = (f[purposeIdx] || '').trim();
    const objects = (f[objectsIdx] || '').trim();
    const aka = (f[akaIdx] || '').trim();

    newOrgs.push({
      name: name,
      name_normalised: name.toUpperCase().trim(),
      charity_number: rcn,
      cro_number: croNum || null,
      governing_form: govForm || null,
      sector: mapSector(classification),
      county: extractCounty(address),
      address: address || null,
      also_known_as: aka || null,
      status: status.toLowerCase() === 'registered' ? 'active' : (status || 'active'),
    });
  }

  console.log(`\nSkipped: ${skippedDuplicates} duplicates, ${skippedInvalid} invalid rows`);
  console.log(`New charities to import: ${newOrgs.length}`);

  if (newOrgs.length === 0) {
    console.log('Nothing to import!');
    return;
  }

  // Sector breakdown
  const sectorCounts = {};
  newOrgs.forEach(o => { sectorCounts[o.sector] = (sectorCounts[o.sector] || 0) + 1; });
  console.log('\nNew orgs by sector:');
  Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log(`  ${s}: ${c}`));

  // County breakdown
  const countyCounts = {};
  newOrgs.forEach(o => { countyCounts[o.county || 'Unknown'] = (countyCounts[o.county || 'Unknown'] || 0) + 1; });
  console.log('\nTop counties:');
  Object.entries(countyCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => console.log(`  ${c}: ${n}`));

  // ============================================================
  // Insert in batches
  // ============================================================
  console.log('\n--- Inserting new organisations ---');
  const batchSize = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < newOrgs.length; i += batchSize) {
    const batch = newOrgs.slice(i, i + batchSize);
    const { error } = await supabase.from('organisations').insert(batch);

    if (error) {
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

    if ((i + batchSize) % 500 === 0 || i + batchSize >= newOrgs.length) {
      console.log(`  Progress: ${Math.min(i + batchSize, newOrgs.length)}/${newOrgs.length} (inserted: ${inserted})`);
    }
  }

  // Get new total
  const { count } = await supabase.from('organisations').select('*', { count: 'exact', head: true });

  console.log('\n' + '='.repeat(50));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(50));
  console.log(`New organisations added: ${inserted}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total orgs in database: ${count}`);
  console.log('='.repeat(50));

  if (inserted > 0) {
    console.log('\nNow re-run import_directors.cjs to link directors to these new orgs:');
    console.log('  node scripts/import_directors.cjs');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

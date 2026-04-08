#!/usr/bin/env node
/**
 * Migrate data.js → Supabase
 *
 * Usage:
 *   1. Create a Supabase project at supabase.com
 *   2. Run 001_schema.sql in the SQL Editor
 *   3. Set environment variables:
 *      export SUPABASE_URL=https://your-project.supabase.co
 *      export SUPABASE_SERVICE_KEY=your-service-role-key
 *   4. npm install @supabase/supabase-js
 *   5. node supabase/migrate_data.js
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Data quality caps
const MAX_INCOME = 25e9;  // €25B — HSE is ~€20B, nothing should exceed this

function normaliseName(raw) {
  return raw.toLowerCase().trim()
    .replace(/\s+(clg|limited|ltd|unlimited company|company limited by guarantee|t\/a\s+.*)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFinancial(val) {
  const n = Number(val) || 0;
  if (n < 0) return 0;
  if (n > MAX_INCOME) return 0;  // Corrupt data — reject
  return n;
}

async function loadDataJs() {
  const content = fs.readFileSync('src/data.js', 'utf8');
  const jsonStart = content.indexOf('{');
  const jsonEnd = content.lastIndexOf(';');
  return JSON.parse(content.slice(jsonStart, jsonEnd));
}

async function migrateFunders(data) {
  console.log(`\nMigrating ${data.funders.length} funders...`);
  const rows = data.funders.map(f => ({
    name: f.name,
    type: f.type || 'Government',
    scraper_id: f.source === 'OpenBenefacts Scrapers' ? f.name.toLowerCase().replace(/\s+/g, '_') : null,
    scrape_frequency: f.source === 'OpenBenefacts Scrapers' ? 'weekly' : 'legacy',
  }));

  const { data: inserted, error } = await supabase
    .from('funders')
    .upsert(rows, { onConflict: 'name' })
    .select();

  if (error) { console.error('Funder insert error:', error); return {}; }
  console.log(`  Inserted ${inserted.length} funders`);

  // Build name→id lookup
  const lookup = {};
  inserted.forEach(f => lookup[f.name] = f.id);

  // Insert programmes
  for (const f of data.funders) {
    if (!f.programmes?.length || !lookup[f.name]) continue;
    const progRows = f.programmes.map(p => ({
      funder_id: lookup[f.name],
      name: p
    }));
    const { error: pErr } = await supabase
      .from('funding_programmes')
      .upsert(progRows, { onConflict: 'funder_id,name' });
    if (pErr) console.error(`  Programme insert error for ${f.name}:`, pErr);
  }

  return lookup;
}

async function migrateOrganisations(data) {
  console.log(`\nMigrating ${data.allOrgs.length} organisations...`);

  let cleaned = 0;
  let rejected = 0;
  const orgIdMap = {};  // old numeric id → new uuid

  // Process in batches of 500
  const batchSize = 500;
  const orgs = data.allOrgs;

  for (let i = 0; i < orgs.length; i += batchSize) {
    const batch = orgs.slice(i, i + batchSize);
    const rows = [];

    for (const o of batch) {
      // Skip orgs with no name
      if (!o.n || o.n.length < 2) { rejected++; continue; }

      const inc = cleanFinancial(o.inc);
      const origInc = Number(o.inc) || 0;
      if (origInc > MAX_INCOME) cleaned++;

      rows.push({
        name: o.n,
        name_normalised: normaliseName(o.n),
        also_known_as: o.aka ? [o.aka] : [],
        charity_number: o.rcn || null,
        cro_number: o.cro || null,
        revenue_chy: o.revCHY || null,
        sector: o.s || null,
        subsector: o.ss || null,
        county: o.c || null,
        address: o.address || '',
        eircode: o.eircode || '',
        governing_form: o.gf || '',
        date_incorporated: o.dateInc || null,
        benefacts_id: o.benefactsId || '',
      });
    }

    if (rows.length === 0) continue;

    const { data: inserted, error } = await supabase
      .from('organisations')
      .insert(rows)
      .select('id, name');

    if (error) {
      console.error(`  Batch ${i / batchSize + 1} error:`, error.message);
      // Try one by one for this batch
      for (const row of rows) {
        const { data: single, error: sErr } = await supabase
          .from('organisations')
          .insert(row)
          .select('id, name');
        if (sErr) {
          console.error(`    Skip: ${row.name} — ${sErr.message}`);
          rejected++;
        } else if (single?.[0]) {
          // Find original org to map IDs
          const orig = batch.find(b => b.n === single[0].name);
          if (orig) orgIdMap[orig.id] = single[0].id;
        }
      }
    } else if (inserted) {
      // Map old IDs to new UUIDs
      for (let j = 0; j < inserted.length; j++) {
        const origOrg = batch.find(b => b.n === inserted[j].name);
        if (origOrg) orgIdMap[origOrg.id] = inserted[j].id;
      }
    }

    process.stdout.write(`  ${Math.min(i + batchSize, orgs.length)}/${orgs.length} orgs...\r`);
  }

  console.log(`\n  Migrated. Cleaned ${cleaned} corrupt values, rejected ${rejected} bad records.`);
  return orgIdMap;
}

async function migrateFinancials(data, orgIdMap) {
  console.log(`\nMigrating financials...`);

  const batchSize = 500;
  let count = 0;
  const rows = [];

  for (const o of data.allOrgs) {
    const newId = orgIdMap[o.id];
    if (!newId) continue;

    const inc = cleanFinancial(o.inc);
    const exp = cleanFinancial(o.exp);
    if (inc === 0 && exp === 0) continue;  // No financial data

    rows.push({
      org_id: newId,
      year: 2024,  // Latest year from bulk data
      gross_income: inc,
      gross_expenditure: exp,
      government_income: cleanFinancial(o.govInc),
      public_income: cleanFinancial(o.pubInc),
      donations_income: cleanFinancial(o.donInc),
      trading_income: cleanFinancial(o.tradInc),
      other_income: cleanFinancial(o.othInc),
      surplus: cleanFinancial(o.surplus),
      employees: Math.max(0, Number(o.emp) || 0),
      volunteers: Math.max(0, Number(o.vol) || 0),
      total_assets: cleanFinancial(o.ta),
      total_liabilities: cleanFinancial(o.tl),
      net_assets: cleanFinancial(o.na),
      state_funding_pct: Math.min(100, Math.max(0, Number(o.sfp) || 0)),
      source: 'legacy_data_js',
    });
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('financials').upsert(batch, { onConflict: 'org_id,year' });
    if (error) console.error(`  Financials batch error:`, error.message);
    count += batch.length;
    process.stdout.write(`  ${count}/${rows.length} financials...\r`);
  }

  console.log(`\n  Migrated ${count} financial records.`);
}

async function main() {
  console.log('OpenBenefacts Data Migration');
  console.log('============================\n');
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // Test connection
  const { data: test, error: testErr } = await supabase.from('funders').select('count').limit(1);
  if (testErr) {
    console.error('Cannot connect to Supabase:', testErr.message);
    console.error('Make sure you have run 001_schema.sql first.');
    process.exit(1);
  }
  console.log('Connected to Supabase successfully.\n');

  // Load data
  const data = await loadDataJs();
  console.log(`Loaded data.js: ${data.allOrgs.length} orgs, ${data.funders.length} funders`);

  // Migrate in order
  const funderLookup = await migrateFunders(data);
  const orgIdMap = await migrateOrganisations(data);
  await migrateFinancials(data, orgIdMap);

  // Summary
  console.log('\n============================');
  console.log('Migration complete!');
  console.log(`  Funders: ${Object.keys(funderLookup).length}`);
  console.log(`  Organisations: ${Object.keys(orgIdMap).length}`);
  console.log('\nNext steps:');
  console.log('  1. Verify data in Supabase Dashboard');
  console.log('  2. Update frontend to use Supabase client');
  console.log('  3. Run scrapers to add grant-level data');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });

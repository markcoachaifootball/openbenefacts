#!/usr/bin/env node
/**
 * Migrate data.js → Supabase (via REST API — no SDK dependency issues)
 */

const fs = require('fs');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const MAX_INCOME = 25e9;

function normaliseName(raw) {
  return raw.toLowerCase().trim()
    .replace(/\s+(clg|limited|ltd|unlimited company|company limited by guarantee|t\/a\s+.*)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(val) {
  const n = Number(val) || 0;
  return (n < 0 || n > MAX_INCOME) ? 0 : n;
}

function supabaseRequest(table, method, body, query = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}${query}`);
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (method === 'POST') {
      headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
    } else {
      headers['Prefer'] = 'return=representation';
    }

    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`${res.statusCode}: ${data.slice(0, 300)}`));
        } else {
          try { resolve(JSON.parse(data || '[]')); }
          catch { resolve(data); }
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('OpenBenefacts Data Migration (REST API)');
  console.log('========================================\n');

  // Load data.js
  const content = fs.readFileSync('src/data.js', 'utf8');
  const jsonStart = content.indexOf('{');
  const jsonEnd = content.lastIndexOf(';');
  const data = JSON.parse(content.slice(jsonStart, jsonEnd));
  console.log(`Loaded: ${data.allOrgs.length} orgs, ${data.funders.length} funders\n`);

  // 1. Insert funders
  console.log('Inserting funders...');
  const funderRows = data.funders.map(f => ({
    name: f.name,
    type: f.type || 'Government',
    scraper_id: f.source === 'OpenBenefacts Scrapers' ? f.name.toLowerCase().replace(/\s+/g, '_') : null,
    scrape_frequency: f.source === 'OpenBenefacts Scrapers' ? 'weekly' : 'legacy',
  }));

  const insertedFunders = await supabaseRequest('funders', 'POST', funderRows, '?on_conflict=name');
  const funderLookup = {};
  insertedFunders.forEach(f => funderLookup[f.name] = f.id);
  console.log(`  ${insertedFunders.length} funders inserted\n`);

  // 2. Insert programmes
  console.log('Inserting programmes...');
  let progCount = 0;
  for (const f of data.funders) {
    if (!f.programmes?.length || !funderLookup[f.name]) continue;
    const progRows = f.programmes.map(p => ({ funder_id: funderLookup[f.name], name: p }));
    try {
      await supabaseRequest('funding_programmes', 'POST', progRows, '?on_conflict=funder_id,name');
      progCount += progRows.length;
    } catch (err) {
      console.error(`  Error for ${f.name}: ${err.message.slice(0, 100)}`);
    }
  }
  console.log(`  ${progCount} programmes inserted\n`);

  // 3. Insert organisations in batches
  console.log('Inserting organisations...');
  const batchSize = 200;
  let orgCount = 0;
  let cleaned = 0;

  for (let i = 0; i < data.allOrgs.length; i += batchSize) {
    const batch = data.allOrgs.slice(i, i + batchSize);
    const rows = [];

    for (const o of batch) {
      if (!o.n || o.n.length < 2) continue;
      if ((Number(o.inc) || 0) > MAX_INCOME) cleaned++;

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
        date_incorporated: o.dateInc ? o.dateInc : null,
        benefacts_id: o.benefactsId || '',
      });
    }

    if (rows.length === 0) continue;

    try {
      const inserted = await supabaseRequest('organisations', 'POST', rows);
      orgCount += (Array.isArray(inserted) ? inserted.length : 0);
    } catch (err) {
      console.error(`  Batch ${Math.floor(i / batchSize) + 1} error: ${err.message.slice(0, 200)}`);
      // Try one by one for failed batch
      for (const row of rows) {
        try {
          await supabaseRequest('organisations', 'POST', [row]);
          orgCount++;
        } catch (e2) { /* skip duplicates */ }
      }
    }

    process.stdout.write(`  ${Math.min(i + batchSize, data.allOrgs.length)}/${data.allOrgs.length} (${orgCount} inserted)\r`);
  }
  console.log(`\n  ${orgCount} organisations inserted (${cleaned} income values cleaned)\n`);

  // 4. Fetch org IDs for financials
  console.log('Inserting financials...');
  console.log('  Fetching org IDs...');
  let allOrgIds = [];
  let offset = 0;
  while (true) {
    const page = await supabaseRequest('organisations', 'GET', null, `?select=id,name&limit=1000&offset=${offset}`);
    allOrgIds = allOrgIds.concat(page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  console.log(`  Fetched ${allOrgIds.length} org IDs`);

  const orgNameToId = {};
  allOrgIds.forEach(o => orgNameToId[o.name] = o.id);

  // Build financial batches
  let finCount = 0;
  let currentBatch = [];

  for (const o of data.allOrgs) {
    const uuid = orgNameToId[o.n];
    if (!uuid) continue;

    const inc = clean(o.inc);
    const exp = clean(o.exp);
    if (inc === 0 && exp === 0) continue;

    currentBatch.push({
      org_id: uuid,
      year: 2024,
      gross_income: inc,
      gross_expenditure: exp,
      government_income: clean(o.govInc),
      public_income: clean(o.pubInc),
      donations_income: clean(o.donInc),
      trading_income: clean(o.tradInc),
      other_income: clean(o.othInc),
      surplus: clean(o.surplus),
      employees: Math.max(0, Number(o.emp) || 0),
      volunteers: Math.max(0, Number(o.vol) || 0),
      total_assets: clean(o.ta),
      total_liabilities: clean(o.tl),
      net_assets: clean(o.na),
      state_funding_pct: Math.min(100, Math.max(0, Number(o.sfp) || 0)),
      source: 'legacy_data_js',
    });

    if (currentBatch.length >= 200) {
      try {
        const inserted = await supabaseRequest('financials', 'POST', currentBatch, '?on_conflict=org_id,year');
        finCount += (Array.isArray(inserted) ? inserted.length : 0);
      } catch (err) {
        console.error(`  Financials batch error: ${err.message.slice(0, 200)}`);
      }
      process.stdout.write(`  ${finCount} financials...\r`);
      currentBatch = [];
    }
  }

  // Final batch
  if (currentBatch.length > 0) {
    try {
      const inserted = await supabaseRequest('financials', 'POST', currentBatch, '?on_conflict=org_id,year');
      finCount += (Array.isArray(inserted) ? inserted.length : 0);
    } catch (err) {
      console.error(`  Final financials batch error: ${err.message.slice(0, 200)}`);
    }
  }

  console.log(`\n  ${finCount} financial records inserted\n`);

  // Summary
  console.log('========================================');
  console.log('Migration complete!');
  console.log(`  Funders:        ${insertedFunders.length}`);
  console.log(`  Programmes:     ${progCount}`);
  console.log(`  Organisations:  ${orgCount}`);
  console.log(`  Financials:     ${finCount}`);
  console.log('\nCheck Supabase Dashboard → Table Editor to verify.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

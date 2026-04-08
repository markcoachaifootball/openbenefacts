/**
 * Quick diagnostic: why is Mater not matching?
 * Run: node scripts/debug_mater.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  'https://ilkwspvhqedzjreysuxu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZGXM2KbBc'
);

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function main() {
  console.log('=== MATER DIAGNOSTIC ===\n');

  // 1. Check Supabase for "Mater" orgs
  console.log('--- Supabase organisations with "Mater" ---');
  const { data: materOrgs } = await supabase
    .from('organisations')
    .select('id, name, charity_number')
    .ilike('name', '%mater%');
  if (materOrgs?.length) {
    materOrgs.forEach(o => console.log(`  DB: id=${o.id} | charity_number="${o.charity_number}" | name="${o.name}"`));
  } else {
    console.log('  No orgs found with "mater" in name!');
  }

  // 2. Check if Mater has any org_directors already
  if (materOrgs?.length) {
    for (const o of materOrgs) {
      const { data: dirs, count } = await supabase
        .from('org_directors')
        .select('*, directors(name)', { count: 'exact' })
        .eq('org_id', o.id);
      console.log(`  org_directors for "${o.name}": ${count || 0} records`);
      if (dirs?.length) dirs.slice(0, 3).forEach(d => console.log(`    → ${d.directors?.name} (${d.role})`));
    }
  }

  // 3. Check CSV for "Mater" entries
  console.log('\n--- Charities Register CSV entries with "Mater" ---');
  const csvPath = path.join(__dirname, '..', 'openbenefacts_data', 'charities_register.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  CSV not found at:', csvPath);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = parseCSVLine(lines[0]);

  console.log('  CSV headers:', headers.join(' | '));

  const charityNumIdx = headers.findIndex(h => h.toLowerCase().includes('charity number') || h.toLowerCase().includes('rcn'));
  const charityNameIdx = headers.findIndex(h => h.toLowerCase().includes('charity name') || h.toLowerCase().includes('name'));
  const trusteesIdx = headers.findIndex(h => h.toLowerCase().includes('trustee'));

  console.log(`  Column indices: num=${charityNumIdx}, name=${charityNameIdx}, trustees=${trusteesIdx}`);

  let materCount = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);
    const name = (fields[charityNameIdx] || '').toLowerCase();
    const num = fields[charityNumIdx] || '';

    if (name.includes('mater') || num === '20000349') {
      materCount++;
      console.log(`  CSV row ${i}: RCN="${num}" | Name="${fields[charityNameIdx]}" | Trustees="${(fields[trusteesIdx] || '').substring(0, 100)}..."`);
    }
  }
  if (materCount === 0) {
    console.log('  NO entries found with "mater" in name or RCN 20000349!');
  }

  // 4. Check total org_directors count
  const { count: totalDirs } = await supabase.from('org_directors').select('*', { count: 'exact', head: true });
  console.log(`\n--- Total org_directors in DB: ${totalDirs} ---`);

  // 5. Show a sample org that DOES have directors
  const { data: sampleLink } = await supabase
    .from('org_directors')
    .select('org_id, organisations(name), directors(name), role')
    .limit(3);
  if (sampleLink?.length) {
    console.log('\nSample working org-director links:');
    sampleLink.forEach(s => console.log(`  ${s.organisations?.name} → ${s.directors?.name} (${s.role})`));
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });

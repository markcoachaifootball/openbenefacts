/**
 * OpenBenefacts Director/Trustee Importer
 *
 * Parses trustee data from the Charities Register CSV and imports
 * into the directors + org_directors tables in Supabase.
 *
 * Also fetches CRO director data from opendata.cro.ie for cross-referencing.
 *
 * Run: node scripts/import_directors.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ilkwspvhqedzjreysuxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZXrfyZGXM2KbBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// CSV Parser (handles quoted fields with commas)
// ============================================================
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

// ============================================================
// Parse trustee string into structured data
// Format: "Name (Role) (DD/MM/YYYY); Name (DD/MM/YYYY); ..."
// ============================================================
function parseTrustees(trusteeStr) {
  if (!trusteeStr || trusteeStr.trim() === '') return [];

  const trustees = [];
  // Split by semicolon
  const parts = trusteeStr.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    let name = part;
    let role = 'Trustee';
    let startDate = null;

    // Extract date - pattern (DD/MM/YYYY) at the end
    const dateMatch = name.match(/\((\d{2}\/\d{2}\/\d{4})\)\s*$/);
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split('/');
      startDate = `${year}-${month}-${day}`;
      name = name.replace(dateMatch[0], '').trim();
    }

    // Extract role - pattern (Trustee Chairperson), (Secretary), etc.
    const roleMatch = name.match(/\((Trustee\s+\w+|Secretary|Chairperson|Chair|Treasurer|Director)\)/i);
    if (roleMatch) {
      role = roleMatch[1].trim();
      name = name.replace(roleMatch[0], '').trim();
    }

    // Clean up name
    name = name
      .replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|Rev\.?)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (name && name.length > 1) {
      trustees.push({ name, role, startDate });
    }
  }

  return trustees;
}

function normaliseName(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Normalize charity number for matching (strip prefixes, spaces, leading zeros)
// ============================================================
function normaliseCharityNum(num) {
  if (!num) return '';
  return String(num)
    .replace(/^(RCN|CHY|CRA)\s*/i, '')  // strip common prefixes
    .replace(/\s+/g, '')
    .replace(/^0+/, '')  // strip leading zeros
    .trim();
}

// Normalize org name for fuzzy matching
function normaliseOrgName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\b(LIMITED|LTD|CLG|DAC|DESIGNATED ACTIVITY COMPANY|COMPANY LIMITED BY GUARANTEE|T\/A|TRADING AS|THE)\b/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Load organisation lookup from Supabase
// ============================================================
async function getOrgLookup() {
  console.log('Loading organisation lookup...');
  let allOrgs = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, charity_number')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrgs = allOrgs.concat(data);
    page++;
    if (data.length < pageSize) break;
  }
  console.log(`Loaded ${allOrgs.length} organisations`);

  const byCharity = {};      // normalised charity number → id
  const byCharityRaw = {};   // raw charity number → id
  const byName = {};          // exact uppercase name → id
  const byNameFuzzy = {};     // normalised name → id

  allOrgs.forEach(o => {
    if (o.charity_number) {
      byCharityRaw[String(o.charity_number).trim()] = o.id;
      byCharity[normaliseCharityNum(o.charity_number)] = o.id;
    }
    if (o.name) {
      byName[o.name.toUpperCase().trim()] = o.id;
      byNameFuzzy[normaliseOrgName(o.name)] = o.id;
    }
  });

  console.log(`Lookup keys: ${Object.keys(byCharity).length} charity nums, ${Object.keys(byName).length} names, ${Object.keys(byNameFuzzy).length} fuzzy names`);
  return { byCharity, byCharityRaw, byName, byNameFuzzy, total: allOrgs.length };
}

// ============================================================
// Main import
// ============================================================
async function main() {
  console.log('=== OpenBenefacts Director/Trustee Importer ===\n');

  const orgLookup = await getOrgLookup();

  // Read charities register CSV
  const csvPath = path.join(__dirname, '..', 'openbenefacts_data', 'charities_register.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('Charities register CSV not found at:', csvPath);
    process.exit(1);
  }

  console.log('\nParsing charities register CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = parseCSVLine(lines[0]);

  // Find column indices
  const charityNumIdx = headers.indexOf('Registered Charity Number');
  const charityNameIdx = headers.indexOf('Registered Charity Name');
  const trusteesIdx = headers.indexOf('Trustees (Start Date)');

  console.log(`Columns found: charity_number=${charityNumIdx}, name=${charityNameIdx}, trustees=${trusteesIdx}`);

  // Parse all trustees
  const allDirectors = new Map(); // normalised name -> { name, appearances }
  const allOrgDirectors = []; // { charityNumber, charityName, directorNorm, role, startDate }

  let orgsWithTrustees = 0;
  let totalTrusteeEntries = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);

    const charityNum = fields[charityNumIdx] || '';
    const charityName = fields[charityNameIdx] || '';
    const trusteesStr = fields[trusteesIdx] || '';

    const trustees = parseTrustees(trusteesStr);
    if (trustees.length === 0) continue;

    orgsWithTrustees++;
    totalTrusteeEntries += trustees.length;

    // Match org — try multiple strategies
    const orgId = orgLookup.byCharityRaw[charityNum.trim()] ||
                  orgLookup.byCharity[normaliseCharityNum(charityNum)] ||
                  orgLookup.byName[charityName.toUpperCase().trim()] ||
                  orgLookup.byNameFuzzy[normaliseOrgName(charityName)] ||
                  null;

    for (const t of trustees) {
      const norm = normaliseName(t.name);
      if (!norm || norm.length < 3) continue;

      if (!allDirectors.has(norm)) {
        allDirectors.set(norm, { name: t.name, count: 0 });
      }
      allDirectors.get(norm).count++;

      allOrgDirectors.push({
        charityNum,
        charityName,
        orgId,
        directorNorm: norm,
        directorName: t.name,
        role: t.role,
        startDate: t.startDate,
      });
    }
  }

  console.log(`\nParsed ${orgsWithTrustees} orgs with trustees`);
  console.log(`Total trustee entries: ${totalTrusteeEntries}`);
  console.log(`Unique directors: ${allDirectors.size}`);

  const matched = allOrgDirectors.filter(d => d.orgId);
  const unmatched = allOrgDirectors.filter(d => !d.orgId);
  const unmatchedOrgs = new Map();
  unmatched.forEach(d => { if (!unmatchedOrgs.has(d.charityNum)) unmatchedOrgs.set(d.charityNum, d.charityName); });
  console.log(`Matched to existing orgs: ${matched.length} links (${new Set(matched.map(d => d.orgId)).size} unique orgs)`);
  console.log(`Unmatched: ${unmatchedOrgs.size} orgs (${unmatched.length} links)`);
  console.log('\nSample unmatched orgs (first 20):');
  let sample = 0;
  for (const [num, name] of unmatchedOrgs) {
    if (sample++ >= 20) break;
    console.log(`  RCN=${num} | ${name}`);
  }

  // Show cross-directorship stats
  const multiBoard = [...allDirectors.values()].filter(d => d.count > 1);
  console.log(`\nDirectors on multiple boards: ${multiBoard.length}`);
  const top10 = multiBoard.sort((a, b) => b.count - a.count).slice(0, 10);
  console.log('Top 10 most-connected directors:');
  top10.forEach(d => console.log(`  ${d.name}: ${d.count} boards`));

  // ============================================================
  // Insert directors in batches
  // ============================================================
  console.log('\n--- Inserting Directors ---');

  const directorEntries = [...allDirectors.entries()].map(([norm, info]) => ({
    name: info.name,
    name_normalised: norm,
  }));

  const batchSize = 200;
  let directorInserted = 0;
  let directorErrors = 0;

  for (let i = 0; i < directorEntries.length; i += batchSize) {
    const batch = directorEntries.slice(i, i + batchSize);
    const { error } = await supabase
      .from('directors')
      .upsert(batch, { onConflict: 'name_normalised', ignoreDuplicates: true });

    if (error) {
      // Try one by one
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('directors')
          .upsert(row, { onConflict: 'name_normalised', ignoreDuplicates: true });
        if (rowErr) directorErrors++;
        else directorInserted++;
      }
    } else {
      directorInserted += batch.length;
    }

    if ((i + batchSize) % 2000 === 0 || i + batchSize >= directorEntries.length) {
      console.log(`  Progress: ${Math.min(i + batchSize, directorEntries.length)}/${directorEntries.length}`);
    }
  }

  console.log(`Inserted ${directorInserted} directors (${directorErrors} errors)`);

  // ============================================================
  // Fetch director IDs back for linking
  // ============================================================
  console.log('\n--- Fetching director IDs ---');
  const directorIdMap = {};
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('directors')
      .select('id, name_normalised')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(d => { directorIdMap[d.name_normalised] = d.id; });
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Loaded ${Object.keys(directorIdMap).length} director IDs`);

  // ============================================================
  // Insert org_directors links (only for matched orgs)
  // ============================================================
  console.log('\n--- Inserting Org-Director Links ---');

  const orgDirLinks = allOrgDirectors
    .filter(d => d.orgId && directorIdMap[d.directorNorm])
    .map(d => ({
      org_id: d.orgId,
      director_id: directorIdMap[d.directorNorm],
      role: d.role,
      start_date: d.startDate,
      source: 'charities_register',
    }));

  console.log(`Links to insert: ${orgDirLinks.length} (only matched orgs)`);

  let linkInserted = 0;
  let linkErrors = 0;

  for (let i = 0; i < orgDirLinks.length; i += batchSize) {
    const batch = orgDirLinks.slice(i, i + batchSize);
    const { error } = await supabase
      .from('org_directors')
      .upsert(batch, { onConflict: 'org_id,director_id,role', ignoreDuplicates: true });

    if (error) {
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('org_directors')
          .upsert(row, { onConflict: 'org_id,director_id,role', ignoreDuplicates: true });
        if (rowErr) {
          linkErrors++;
          if (linkErrors <= 3) console.error('  Link error:', rowErr.message);
        }
        else linkInserted++;
      }
    } else {
      linkInserted += batch.length;
    }

    if ((i + batchSize) % 2000 === 0 || i + batchSize >= orgDirLinks.length) {
      console.log(`  Progress: ${Math.min(i + batchSize, orgDirLinks.length)}/${orgDirLinks.length}`);
    }
  }

  console.log(`\nInserted ${linkInserted} org-director links (${linkErrors} errors)`);

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n' + '='.repeat(50));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(50));
  console.log(`Directors: ${directorInserted}`);
  console.log(`Org-Director links: ${linkInserted}`);
  console.log(`Cross-board directors: ${multiBoard.length}`);
  console.log(`Unmatched orgs (no org_id): ${allOrgDirectors.filter(d => !d.orgId).length}`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

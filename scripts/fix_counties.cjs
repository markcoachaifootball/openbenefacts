/**
 * OpenBenefacts County Data Cleanup
 *
 * Normalises corrupted/misspelled county values in the organisations table.
 * Maps all variants (ALL CAPS, typos like DORK, DUBLING, LOUHT) to proper
 * title-case Irish county names.
 *
 * Run: node scripts/fix_counties.cjs
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilkwspvhqedzjreysuxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZXrfyZGXM2KbBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Canonical list of 26 Irish counties
const VALID_COUNTIES = [
  'Carlow', 'Cavan', 'Clare', 'Cork', 'Donegal', 'Dublin', 'Galway',
  'Kerry', 'Kildare', 'Kilkenny', 'Laois', 'Leitrim', 'Limerick',
  'Longford', 'Louth', 'Mayo', 'Meath', 'Monaghan', 'Offaly',
  'Roscommon', 'Sligo', 'Tipperary', 'Waterford', 'Westmeath',
  'Wexford', 'Wicklow'
];

// Build a lookup from uppercase canonical names
const canonicalMap = {};
VALID_COUNTIES.forEach(c => { canonicalMap[c.toUpperCase()] = c; });

// Known typos/corruptions from source registries
const TYPO_MAP = {
  'DORK': 'Cork',
  'COORK': 'Cork',
  'CORKE': 'Cork',
  'COR': 'Cork',
  'DUBLING': 'Dublin',
  'DUBLI': 'Dublin',
  'DULBIN': 'Dublin',
  'DUBLN': 'Dublin',
  'LERRY': 'Kerry',
  'KERR': 'Kerry',
  'LOUHT': 'Louth',
  'LOUITH': 'Louth',
  'MEAHT': 'Meath',
  'MAEATH': 'Meath',
  'GALWA': 'Galway',
  'GALWY': 'Galway',
  'LIMERCK': 'Limerick',
  'LIMERIK': 'Limerick',
  'KILDAR': 'Kildare',
  'KILDARRE': 'Kildare',
  'KILKENN': 'Kilkenny',
  'KILKENNEY': 'Kilkenny',
  'WEXFOR': 'Wexford',
  'WEXFROD': 'Wexford',
  'WICKLO': 'Wicklow',
  'WCKLOW': 'Wicklow',
  'WATERFOR': 'Waterford',
  'WATREFORD': 'Waterford',
  'TIPPERAR': 'Tipperary',
  'TIPPEARY': 'Tipperary',
  'DONEGLA': 'Donegal',
  'DONEGALL': 'Donegal',
  'DONGEAL': 'Donegal',
  'LETRIM': 'Leitrim',
  'LIETRIM': 'Leitrim',
  'LONGFROD': 'Longford',
  'LONGORD': 'Longford',
  'MONAGHN': 'Monaghan',
  'MONGHAN': 'Monaghan',
  'OFFLAY': 'Offaly',
  'OFALY': 'Offaly',
  'ROSCOMM': 'Roscommon',
  'ROSCOMON': 'Roscommon',
  'WESTMETH': 'Westmeath',
  'WESTMEAT': 'Westmeath',
  'CARLW': 'Carlow',
  'CAVNA': 'Cavan',
  'CALRE': 'Clare',
  'SLGIO': 'Sligo',
  'MAOY': 'Mayo',
  'LAIOS': 'Laois',
  'LAOUIS': 'Laois',
};

/**
 * Attempt to normalize a county string to a canonical Irish county name.
 * Uses exact match, uppercase match, typo map, and fuzzy Levenshtein matching.
 */
function normaliseCounty(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();

  // 1. Exact match to canonical
  if (canonicalMap[upper]) return canonicalMap[upper];

  // 2. Known typo
  if (TYPO_MAP[upper]) return TYPO_MAP[upper];

  // 3. Strip common prefixes (Co., County, Co )
  const stripped = upper
    .replace(/^CO\.?\s*/i, '')
    .replace(/^COUNTY\s*/i, '')
    .trim();
  if (canonicalMap[stripped]) return canonicalMap[stripped];
  if (TYPO_MAP[stripped]) return TYPO_MAP[stripped];

  // 4. Fuzzy match using Levenshtein distance (max distance 2)
  let bestMatch = null;
  let bestDist = 3; // threshold
  for (const valid of VALID_COUNTIES) {
    const dist = levenshtein(upper, valid.toUpperCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = valid;
    }
  }
  if (bestMatch) return bestMatch;

  // 5. Substring containment
  for (const valid of VALID_COUNTIES) {
    if (upper.includes(valid.toUpperCase()) || valid.toUpperCase().includes(upper)) {
      return valid;
    }
  }

  return null; // Cannot match
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

async function main() {
  console.log('=== OpenBenefacts County Data Cleanup ===\n');

  // Step 1: Get all distinct county values
  const { data: counties, error } = await supabase
    .from('organisations')
    .select('county')
    .not('county', 'is', null)
    .limit(50000);

  if (error) {
    console.error('Failed to fetch counties:', error.message);
    return;
  }

  // Count occurrences
  const counts = {};
  counties.forEach(r => {
    const c = r.county?.trim();
    if (c) counts[c] = (counts[c] || 0) + 1;
  });

  console.log(`Found ${Object.keys(counts).length} distinct county values\n`);

  // Step 2: Categorize each value
  const corrections = []; // { from, to, count }
  const alreadyValid = [];
  const unmatched = [];

  for (const [raw, count] of Object.entries(counts)) {
    const normalised = normaliseCounty(raw);

    if (!normalised) {
      unmatched.push({ raw, count });
    } else if (raw === normalised) {
      alreadyValid.push({ raw, count });
    } else {
      corrections.push({ from: raw, to: normalised, count });
    }
  }

  // Sort by count
  corrections.sort((a, b) => b.count - a.count);
  unmatched.sort((a, b) => b.count - a.count);

  console.log(`Already correct: ${alreadyValid.length} values (${alreadyValid.reduce((s, v) => s + v.count, 0)} rows)`);
  console.log(`Need correction: ${corrections.length} values (${corrections.reduce((s, v) => s + v.count, 0)} rows)`);
  console.log(`Cannot match:    ${unmatched.length} values (${unmatched.reduce((s, v) => s + v.count, 0)} rows)\n`);

  // Show corrections
  if (corrections.length > 0) {
    console.log('--- Corrections to apply ---');
    corrections.forEach(c => console.log(`  "${c.from}" → "${c.to}" (${c.count} orgs)`));
    console.log('');
  }

  // Show unmatched
  if (unmatched.length > 0) {
    console.log('--- Unmatched values (will be set to null) ---');
    unmatched.forEach(u => console.log(`  "${u.raw}" (${u.count} orgs)`));
    console.log('');
  }

  // Step 3: Apply corrections
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const { from, to, count } of corrections) {
    const { data, error: updateErr } = await supabase
      .from('organisations')
      .update({ county: to })
      .eq('county', from);

    if (updateErr) {
      console.error(`  ERROR updating "${from}" → "${to}": ${updateErr.message}`);
      totalErrors++;
    } else {
      totalUpdated += count;
    }
  }

  // Set clearly garbage values to null
  for (const { raw, count } of unmatched) {
    const { error: nullErr } = await supabase
      .from('organisations')
      .update({ county: null })
      .eq('county', raw);

    if (nullErr) {
      console.error(`  ERROR nulling "${raw}": ${nullErr.message}`);
      totalErrors++;
    } else {
      totalUpdated += count;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${totalUpdated} rows`);
  console.log(`Errors:  ${totalErrors}`);

  // Verify: show final distinct county values
  const { data: finalCounties } = await supabase
    .from('county_counts')
    .select('*')
    .order('org_count', { ascending: false });

  if (finalCounties) {
    console.log(`\nFinal county list (${finalCounties.length} values):`);
    finalCounties.forEach(c => console.log(`  ${c.county}: ${c.org_count} orgs`));
  }
}

main().catch(e => console.error('Fatal:', e));

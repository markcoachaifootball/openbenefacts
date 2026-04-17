import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Fetch platform stats
 */
export async function fetchStats() {
  const { data, error } = await supabase
    .from('platform_stats')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch funder summary (replaces FUNDERS array)
 */
export async function fetchFunders() {
  const { data, error } = await supabase
    .from('funder_summary')
    .select('*')
    .order('total_funding', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Fetch organisations with pagination and search
 * @param {Object} opts - { page, pageSize, search, sector, county, funderName, sortBy, sortDir }
 */
// Common Irish abbreviation → full name map for search expansion
const ABBREVIATIONS = {
  'hse': 'Health Service Executive',
  'ihrec': 'Irish Human Rights and Equality Commission',
  'gaa': 'Gaelic Athletic Association',
  'fai': 'Football Association of Ireland',
  'irfu': 'Irish Rugby Football Union',
  'ucd': 'University College Dublin',
  'ucc': 'University College Cork',
  'tcd': 'Trinity College Dublin',
  'dcu': 'Dublin City University',
  'nuig': 'University of Galway',
  'ul': 'University of Limerick',
  'tud': 'Technological University Dublin',
  'atu': 'Atlantic Technological University',
  'setu': 'South East Technological University',
  'mtu': 'Munster Technological University',
  'hfa': 'Housing Finance Agency',
  'svp': 'Society of St. Vincent de Paul',
  'ispcc': 'Irish Society for the Prevention of Cruelty to Children',
  'rnli': 'Royal National Lifeboat Institution',
  'goal': 'GOAL',
  'nama': 'National Asset Management Agency',
  'hiqa': 'Health Information and Quality Authority',
  'mhi': 'Mental Health Ireland',
  'nda': 'National Disability Authority',
  'ncse': 'National Council for Special Education',
  'sfi': 'Science Foundation Ireland',
  'eirgrid': 'EirGrid',
  'etbi': 'Education and Training Boards Ireland',
  'cdetb': 'City of Dublin Education and Training Board',
  'ddletb': 'Dublin and Dun Laoghaire Education and Training Board',
  'nui': 'National University of Ireland',
  'rcsi': 'Royal College of Surgeons in Ireland',
  'ipa': 'Institute of Public Administration',
  'ida': 'Industrial Development Agency',
  'enterprise ireland': 'Enterprise Ireland',
  'bord bia': 'An Bord Bia',
  'teagasc': 'Teagasc',
  'tusla': 'Child and Family Agency',
  'pobal': 'Pobal',
  'solas': 'SOLAS',
  'cif': 'Construction Industry Federation',
  'ibec': 'Irish Business and Employers Confederation',
  'ictu': 'Irish Congress of Trade Unions',
  'asti': 'Association of Secondary Teachers Ireland',
  'into': 'Irish National Teachers Organisation',
  'tui': 'Teachers Union of Ireland',
  'garda': 'An Garda Síochána',
  'opc': 'Office of the Planning Regulator',
  'cro': 'Companies Registration Office',
  'rte': 'Raidió Teilifís Éireann',
};

function expandSearch(term) {
  const lower = term.toLowerCase().trim();
  const expanded = ABBREVIATIONS[lower];
  return expanded || null;
}

export async function fetchOrganisations({
  page = 1,
  pageSize = 50,
  search = '',
  sector = '',
  county = '',
  funderName = '',
  governingForm = '',
  minIncome = null,
  maxIncome = null,
  sortBy = 'gross_income',
  sortDir = 'desc',
} = {}) {
  let query = supabase
    .from('org_summary')
    .select('*', { count: 'exact' });

  // Full-text search — sanitize special chars that break PostgREST filter syntax
  if (search) {
    const s = search.replace(/[%_(),]/g, ' ').trim();
    if (s.length >= 2) {
      // Expand abbreviations (e.g. "HSE" → "Health Service Executive")
      const expanded = expandSearch(s);
      if (expanded) {
        const e = expanded.replace(/[%_(),]/g, ' ').trim();
        query = query.or(`name.ilike.%${s}%,name.ilike.%${e}%,charity_number.eq.${s},cro_number.eq.${s}`);
      } else {
        query = query.or(`name.ilike.%${s}%,charity_number.eq.${s},cro_number.eq.${s}`);
      }
    }
  }

  // Filters
  if (sector) query = query.eq('sector', sector);
  if (county) query = query.eq('county', county);
  if (governingForm) query = query.eq('governing_form', governingForm);
  if (minIncome != null) query = query.gte('gross_income', minIncome);
  if (maxIncome != null) query = query.lte('gross_income', maxIncome);

  // Sorting
  const validSorts = ['gross_income', 'gross_expenditure', 'total_grant_amount', 'name', 'employees'];
  const col = validSorts.includes(sortBy) ? sortBy : 'gross_income';
  query = query.order(col, { ascending: sortDir === 'asc', nullsFirst: false });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { orgs: data, total: count, page, pageSize };
}

/**
 * Fetch a single organisation with full details
 */
export async function fetchOrganisation(id) {
  const { data: org, error: orgErr } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', id)
    .single();
  if (orgErr) throw orgErr;

  // Get financials history
  const { data: financials } = await supabase
    .from('financials')
    .select('*')
    .eq('org_id', id)
    .order('year', { ascending: false });

  // Get grants
  const { data: grants } = await supabase
    .from('funding_grants')
    .select('*, funders(name)')
    .eq('org_id', id)
    .order('year', { ascending: false });

  // Get board members / directors
  const { data: boardMembers } = await supabase
    .from('org_directors')
    .select('*, directors(id, name, name_normalised)')
    .eq('org_id', id)
    .order('start_date', { ascending: true });

  return { ...org, financials: financials || [], grants: grants || [], boardMembers: boardMembers || [] };
}

/**
 * Fetch other boards a director sits on (for cross-directorship)
 */
export async function fetchDirectorBoards(directorId) {
  const { data, error } = await supabase
    .from('org_directors')
    .select('*, organisations(id, name, sector, county)')
    .eq('director_id', directorId)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Fetch grants for a specific funder
 */
export async function fetchFunderGrants(funderId, { page = 1, pageSize = 50, programme = null } = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('funding_grants')
    .select('*, organisations(id, name, sector, county)', { count: 'exact' })
    .eq('funder_id', funderId);

  if (programme) query = query.eq('programme', programme);

  const { data, error, count } = await query
    .order('amount', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { grants: data, total: count, page, pageSize };
}

/**
 * Fetch grants for a funder by name (fallback when no funder_id)
 */
export async function fetchFunderGrantsByName(funderName, { page = 1, pageSize = 50 } = {}) {
  // First try to find the funder by name
  const shortName = funderName.split("/")[0].split("(")[0].trim();
  const { data: funderRows } = await supabase
    .from('funders')
    .select('id')
    .ilike('name', `%${shortName}%`)
    .limit(1);

  if (funderRows && funderRows.length > 0) {
    return fetchFunderGrants(funderRows[0].id, { page, pageSize });
  }

  // If no funder found, search grants by funder name via join
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from('funding_grants')
    .select('*, organisations(id, name, sector, county), funders!inner(name)', { count: 'exact' })
    .ilike('funders.name', `%${shortName}%`)
    .order('amount', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { grants: data, total: count, page, pageSize };
}

/**
 * Fetch sector benchmark stats (avg income, expenditure, employees for a sector)
 */
export async function fetchSectorBenchmark(sector) {
  if (!sector) return null;
  const { data, error } = await supabase
    .from('org_summary')
    .select('gross_income, gross_expenditure')
    .eq('sector', sector)
    .not('gross_income', 'is', null)
    .gt('gross_income', 0)
    .limit(500);

  if (error || !data || data.length === 0) return null;

  const incomes = data.map(d => d.gross_income).filter(Boolean).sort((a, b) => a - b);
  const expenditures = data.map(d => d.gross_expenditure).filter(Boolean).sort((a, b) => a - b);
  const median = arr => arr.length === 0 ? 0 : arr[Math.floor(arr.length / 2)];
  const avg = arr => arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    sectorName: sector,
    orgCount: data.length,
    medianIncome: median(incomes),
    avgIncome: avg(incomes),
    medianExpenditure: median(expenditures),
    avgExpenditure: avg(expenditures),
  };
}

/**
 * Fetch ALL grants for a funder (no pagination limit) — for deep analytics
 */
export async function fetchAllFunderGrants(funderId) {
  const allGrants = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('funding_grants')
      .select('*, organisations(id, name, sector, county, charity_number)')
      .eq('funder_id', funderId)
      .order('amount', { ascending: false })
      .range(from, from + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allGrants.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return allGrants;
}

/**
 * Resolve a funder by name to get its ID
 */
export async function resolveFunderByName(name) {
  const shortName = name.split("/")[0].split("(")[0].trim();
  const { data } = await supabase
    .from('funders')
    .select('*')
    .ilike('name', `%${shortName}%`)
    .limit(1);
  return data?.[0] || null;
}

/**
 * Search organisations (for autocomplete/search bar)
 */
export async function searchOrganisations(query, limit = 10) {
  if (!query || query.length < 2) return [];

  const q = query.replace(/[%_(),]/g, ' ').trim();
  if (q.length < 2) return [];

  // Expand abbreviations
  const expanded = expandSearch(q);
  const orFilter = expanded
    ? `name.ilike.%${q}%,name.ilike.%${expanded.replace(/[%_(),]/g, ' ').trim()}%,charity_number.eq.${q}`
    : `name.ilike.%${q}%,charity_number.eq.${q}`;

  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, sector, county, charity_number')
    .or(orFilter)
    .order('name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Fetch sector breakdown — uses efficient server-side view
 */
export async function fetchSectorCounts() {
  const { data, error } = await supabase
    .from('sector_counts')
    .select('*')
    .order('org_count', { ascending: false });

  if (error) {
    // Fallback: manual count if view doesn't exist yet
    const { data: orgs } = await supabase
      .from('organisations')
      .select('sector')
      .not('sector', 'is', null)
      .limit(5000);
    const counts = {};
    orgs?.forEach(o => { if (o.sector) counts[o.sector] = (counts[o.sector] || 0) + 1; });
    return Object.entries(counts)
      .map(([sector, org_count]) => ({ sector, org_count }))
      .sort((a, b) => b.org_count - a.org_count);
  }
  return data;
}

/**
 * Fetch county breakdown — uses efficient server-side view
 */
export async function fetchCountyCounts() {
  const { data, error } = await supabase
    .from('county_counts')
    .select('*')
    .order('org_count', { ascending: false });

  if (error) {
    const { data: orgs } = await supabase
      .from('organisations')
      .select('county')
      .not('county', 'is', null)
      .limit(5000);
    const counts = {};
    orgs?.forEach(o => { if (o.county) counts[o.county] = (counts[o.county] || 0) + 1; });
    return Object.entries(counts)
      .map(([county, org_count]) => ({ county, org_count }))
      .sort((a, b) => b.org_count - a.org_count);
  }
  return data;
}

/**
 * Fetch subsector breakdown for a given sector
 */
export async function fetchSubsectorCounts(sector) {
  if (!sector) return [];
  const { data, error } = await supabase
    .from('organisations')
    .select('subsector')
    .eq('sector', sector)
    .not('subsector', 'is', null)
    .limit(5000);
  if (error) return [];
  const counts = {};
  data?.forEach(o => { if (o.subsector) counts[o.subsector] = (counts[o.subsector] || 0) + 1; });
  return Object.entries(counts)
    .map(([subsector, count]) => ({ subsector, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Fetch governing form counts for filter display
 */
export async function fetchGovFormCounts() {
  const { data, error } = await supabase
    .from('organisations')
    .select('governing_form')
    .not('governing_form', 'is', null)
    .limit(10000);
  if (error) return [];
  const counts = {};
  data?.forEach(o => { if (o.governing_form) counts[o.governing_form] = (counts[o.governing_form] || 0) + 1; });
  return Object.entries(counts)
    .map(([form, count]) => ({ form, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Advanced search — supports multi-value filters (arrays of sectors, counties, etc.)
 */
export async function fetchOrganisationsAdvanced({
  page = 1,
  pageSize = 50,
  search = '',
  sectors = [],
  subsectors = [],
  counties = [],
  govForms = [],
  minIncome = null,
  maxIncome = null,
  hasCharityNumber = null,
  hasCroNumber = null,
  hasChyNumber = null,
  hasFunding = null,
  sortBy = 'gross_income',
  sortDir = 'desc',
} = {}) {
  let query = supabase
    .from('org_summary')
    .select('*', { count: 'exact' });

  // Full-text search
  if (search) {
    const s = search.replace(/[%_(),]/g, ' ').trim();
    if (s.length >= 2) {
      const expanded = expandSearch(s);
      if (expanded) {
        const e = expanded.replace(/[%_(),]/g, ' ').trim();
        query = query.or(`name.ilike.%${s}%,name.ilike.%${e}%,charity_number.eq.${s},cro_number.eq.${s}`);
      } else {
        query = query.or(`name.ilike.%${s}%,charity_number.eq.${s},cro_number.eq.${s}`);
      }
    }
  }

  // Multi-value filters
  if (sectors.length === 1) query = query.eq('sector', sectors[0]);
  else if (sectors.length > 1) query = query.in('sector', sectors);

  if (subsectors.length === 1) query = query.eq('subsector', subsectors[0]);
  else if (subsectors.length > 1) query = query.in('subsector', subsectors);

  if (counties.length === 1) query = query.eq('county', counties[0]);
  else if (counties.length > 1) query = query.in('county', counties);

  if (govForms.length === 1) query = query.eq('governing_form', govForms[0]);
  else if (govForms.length > 1) query = query.in('governing_form', govForms);

  if (minIncome != null) query = query.gte('gross_income', minIncome);
  if (maxIncome != null) query = query.lte('gross_income', maxIncome);

  // Regulatory filters
  if (hasCharityNumber === true) query = query.not('charity_number', 'is', null);
  if (hasCharityNumber === false) query = query.is('charity_number', null);
  if (hasCroNumber === true) query = query.not('cro_number', 'is', null);
  if (hasCroNumber === false) query = query.is('cro_number', null);
  if (hasChyNumber === true) query = query.not('revenue_chy', 'is', null);
  if (hasFunding === true) query = query.gt('total_grant_amount', 0);

  // Sorting
  const validSorts = ['gross_income', 'gross_expenditure', 'total_grant_amount', 'name', 'employees'];
  const col = validSorts.includes(sortBy) ? sortBy : 'gross_income';
  query = query.order(col, { ascending: sortDir === 'asc', nullsFirst: false });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { orgs: data, total: count, page, pageSize };
}

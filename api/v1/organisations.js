import { supabase, withAuth } from '../_lib/supabase.js';

export default withAuth(async (req, res) => {
  const {
    page = '1', pageSize = '50', search = '', sector = '',
    county = '', governingForm = '', minIncome, maxIncome,
    sortBy = 'gross_income', sortDir = 'desc'
  } = req.query;

  const p = Math.max(1, parseInt(page));
  const ps = Math.min(100, Math.max(1, parseInt(pageSize)));

  let query = supabase.from('org_summary').select('*', { count: 'exact' });

  if (search) {
    const s = search.replace(/[%_(),]/g, ' ').trim();
    if (s.length >= 2) {
      query = query.or(`name.ilike.%${s}%,charity_number.eq.${s},cro_number.eq.${s}`);
    }
  }

  if (sector) query = query.eq('sector', sector);
  if (county) query = query.eq('county', county);
  if (governingForm) query = query.eq('governing_form', governingForm);
  if (minIncome) query = query.gte('gross_income', parseInt(minIncome));
  if (maxIncome) query = query.lte('gross_income', parseInt(maxIncome));

  const validSorts = ['gross_income', 'gross_expenditure', 'total_grant_amount', 'name', 'employees'];
  const col = validSorts.includes(sortBy) ? sortBy : 'gross_income';
  query = query.order(col, { ascending: sortDir === 'asc', nullsFirst: false });

  const from = (p - 1) * ps;
  query = query.range(from, from + ps - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ orgs: data, total: count, page: p, pageSize: ps });
});

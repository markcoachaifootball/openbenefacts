import { supabase, withAuth } from '../_lib/supabase.js';

export default withAuth(async (req, res) => {
  const { q = '', limit = '10' } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" must be at least 2 characters' });
  }

  const s = q.replace(/[%_(),]/g, ' ').trim();
  const lim = Math.min(50, Math.max(1, parseInt(limit)));

  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, sector, county, charity_number')
    .or(`name.ilike.%${s}%,charity_number.eq.${s}`)
    .limit(lim);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ results: data, total: data?.length || 0 });
});

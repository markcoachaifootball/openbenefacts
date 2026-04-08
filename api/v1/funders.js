import { supabase, withAuth } from '../_lib/supabase.js';

export default withAuth(async (req, res) => {
  const { search = '' } = req.query;

  let query = supabase.from('funders').select('*').order('name', { ascending: true });

  if (search) {
    query = query.ilike('name', `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ funders: data, total: data?.length || 0 });
});

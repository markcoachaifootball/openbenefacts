import { supabase, withAuth } from '../_lib/supabase.js';

export default withAuth(async (req, res) => {
  const { data, error } = await supabase
    .from('platform_stats')
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
});

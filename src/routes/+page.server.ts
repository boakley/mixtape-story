import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
  // List every profile that has at least one song; the landing page links them as
  // public mixtapes. At v1 scale (20 users) this is cheap; we add a materialized
  // view if/when it ever isn't.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('handle, songs!inner(id)')
    .order('handle');

  const handles = (profiles ?? [])
    .map((p) => (p as { handle: string }).handle)
    .filter((h, i, arr) => arr.indexOf(h) === i);

  return { handles };
};

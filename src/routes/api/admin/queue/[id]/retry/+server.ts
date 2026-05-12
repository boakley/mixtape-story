import { error, json } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/admin';
import { adminClient } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!isAdminEmail(user?.email)) throw error(401, 'Not authorized');

  const supa = adminClient();
  const { error: updErr } = await supa
    .from('songs')
    .update({ link_status: 'pending', link_attempts: 0, link_last_error: null })
    .eq('id', params.id);
  if (updErr) throw error(500, updErr.message);
  return json({ ok: true });
};

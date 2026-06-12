import { error, redirect } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');
  if (!isAdminEmail(user.email)) throw error(404, 'Not found');
  return { email: user.email };
};

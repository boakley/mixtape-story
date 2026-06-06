import { redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/safe-redirect';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get('code');
  // Validated against open-redirect: only local paths are honored.
  // The invite flow uses this to carry intent — without validation a
  // crafted magic-link could bounce users to an external phishing site.
  const next = safeRedirect(url.searchParams.get('next'), '/me');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) throw redirect(303, next);
  }

  throw redirect(303, '/login?error=callback');
};

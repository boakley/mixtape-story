import { fail, redirect } from '@sveltejs/kit';
import { PUBLIC_SITE_URL } from '$env/static/public';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { session } = await safeGetSession();
  if (session) throw redirect(303, '/me');
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData();
    const email = String(formData.get('email') ?? '').trim();

    if (!email || !email.includes('@')) {
      return fail(400, { email, error: 'Please enter a valid email address.' });
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${PUBLIC_SITE_URL}/auth/callback`
      }
    });

    if (error) {
      return fail(500, { email, error: error.message });
    }

    return { email, sent: true };
  }
};

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const HANDLE_RE = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const RESERVED = new Set([
  'about', 'admin', 'api', 'auth', 'help', 'login', 'logout', 'me', 'onboarding',
  'privacy', 'settings', 'signin', 'signup', 'static', 'support', 'terms',
  'mixtape', 'mixtapestory', 'story', 'stories'
]);

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();

  if (profile) throw redirect(303, `/${profile.handle}`);

  return { email: user.email };
};

export const actions: Actions = {
  default: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const data = await request.formData();
    const handle = String(data.get('handle') ?? '').trim().toLowerCase();
    const displayName = String(data.get('display_name') ?? '').trim();

    if (!handle || !HANDLE_RE.test(handle)) {
      return fail(400, {
        handle, displayName,
        error: 'Handle must be 2-32 chars, start with a letter, and use only lowercase letters, digits, and hyphens.'
      });
    }
    if (RESERVED.has(handle)) {
      return fail(400, { handle, displayName, error: `"${handle}" is reserved. Pick another.` });
    }
    if (!displayName) {
      return fail(400, { handle, displayName, error: 'Please enter a display name.' });
    }

    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      handle,
      display_name: displayName
    });

    if (error) {
      const message = error.code === '23505'
        ? `Handle "${handle}" is already taken.`
        : error.message;
      return fail(400, { handle, displayName, error: message });
    }

    throw redirect(303, `/${handle}`);
  }
};

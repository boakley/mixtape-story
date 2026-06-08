import { fail, redirect } from '@sveltejs/kit';
import { triggerOgRender } from '$lib/server/og-render';
import { safeRedirect } from '$lib/server/safe-redirect';
import type { Actions, PageServerLoad } from './$types';

const HANDLE_RE = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

// Handles users cannot claim. Pre-emptive reservations are cheap now and
// expensive later (negotiating with a real user who claimed `dashboard`
// before we wanted it is much worse than rejecting the signup). Categorized:
//   - System / auth / infra: paths we serve now or are likely to add
//   - Brand / product: protect the product nouns
//   - Discovery / navigation: paths likely to land in the URL space later
//   - Future audiences (per CLAUDE.md "Foundation for future audiences"):
//     artists, memorials, businesses — keep the singular and plural reserved
//     so we have flexibility on the route shape
//   - Single-letter namespace escape hatches: defense-in-depth in case the
//     handle regex ever relaxes; lets us add `/u/{handle}` or `/m/{slug}`
//     later without colliding with a real user
const RESERVED = new Set([
  // system / auth / infra
  'about', 'account', 'admin', 'api', 'auth', 'callback', 'email',
  'help', 'login', 'logout', 'me', 'onboarding', 'privacy', 'robots',
  'settings', 'signin', 'signup', 'sitemap', 'static', 'support',
  'terms', 'verify',

  // brand / product
  'mixtape', 'mixtapes', 'mixtapestory', 'og', 'story', 'stories',

  // discovery / navigation
  'dashboard', 'discover', 'explore', 'feed', 'inbox', 'notifications',
  'search', 'share', 'shared',

  // future audiences
  'artist', 'artists', 'band', 'bands', 'book', 'books',
  'business', 'businesses', 'creator', 'creators', 'fan', 'fans',
  'memorial', 'memorials',

  // single-letter namespace escape hatches
  'a', 'b', 'm', 'u', 'x'
]);

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();

  // `redirect=` lets the invite flow send brand-new visitors back to
  // their invite URL after onboarding. Validated via safeRedirect so
  // an attacker can't bounce users through onboarding to an external
  // phishing target.
  const redirectParam = url.searchParams.get('redirect');

  if (profile) throw redirect(303, safeRedirect(redirectParam, `/${profile.handle}`));

  return { email: user.email, redirect: redirectParam };
};

export const actions: Actions = {
  default: async ({ request, url, fetch, platform, locals: { supabase, safeGetSession } }) => {
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

    // Every profile gets a personal mixtape from day one — mirrors the
    // 0014 migration backfill for pre-existing profiles. Without this
    // row, new signups would have no Mixtape entity to add songs to or
    // move into a group; the editor and /g/{slug} "Add my mixtape here"
    // both assume the personal mixtape exists.
    await supabase.from('mixtapes').insert({
      profile_id: user.id,
      visibility: 'unlisted'
    });

    // Seed an empty-state OG image so the mixtape is shareable from the first
    // moment a handle exists. Renders the "A mixtape, waiting to begin" SVG.
    triggerOgRender(handle, { fetch, platform });

    const redirectParam = url.searchParams.get('redirect');
    throw redirect(303, safeRedirect(redirectParam, `/${handle}`));
  }
};

import { redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/safe-redirect';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

// Browser-independent magic-link verification. The PKCE flow at
// /auth/callback only works when the link opens in the browser that
// requested it — the code verifier lives in that browser's cookies —
// which breaks private tabs, cross-device opens, and in-app browsers.
// The email templates link here instead: verifyOtp checks the emailed
// token_hash directly, no verifier needed, so the link works anywhere.
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const tokenHash = url.searchParams.get('token_hash');
  const type = (url.searchParams.get('type') ?? 'email') as EmailOtpType;

  // The template forwards Supabase's redirect_to (the legacy callback
  // URL); intent like an invite path rides in its `next` param.
  // Validated against open redirects before use, same as the callback.
  let next: string | null = null;
  const redirectTo = url.searchParams.get('redirect_to');
  if (redirectTo) {
    try {
      next = new URL(redirectTo).searchParams.get('next');
    } catch {
      // Malformed redirect_to — fall through to the default.
    }
  }
  const dest = safeRedirect(next, '/me');

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) throw redirect(303, dest);
  }

  throw redirect(303, '/login?error=confirm');
};

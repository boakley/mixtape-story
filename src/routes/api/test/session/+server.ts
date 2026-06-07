import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

// Test-only endpoint: sign in a seeded user by email + password and
// have the SvelteKit server-side Supabase client set the session
// cookies on the browser context. The e2e fixture POSTs here to
// hand each test a browser that's already authenticated.
//
// Hard-gated on `dev` — returns 404 in production builds. The
// password is supplied per-request by the fixture, which generated
// it when it admin-created the test user.

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
  if (!dev) throw error(404, 'Not Found');

  const body = (await request.json()) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    throw error(400, 'email and password required');
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password
  });
  if (signInErr) throw error(401, signInErr.message);

  return json({ ok: true });
};

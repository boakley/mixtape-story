// Seeded-session auth fixture.
//
// Per TESTING.md: most journeys start already authenticated. This
// fixture creates an auth.users + profile + mixtape via the Supabase
// admin API, mints a real magic-link session, follows the verify URL
// to get back the auth cookie, and attaches that cookie to the
// browser context. The test opens the app already signed in — no
// trip through the magic-link UI.
//
// The one test that exercises the magic-link UI for real lives in
// 01-sign-in.spec.ts and uses the helpers in mailpit.ts directly.

import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export type SeededUser = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
};

let counter = 0;
function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@e2e.local`;
}

const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

/**
 * Create a new auth user, profile, and personal mixtape. Returns the
 * seeded user along with an action link the test can navigate to in
 * order to establish a session in the browser.
 */
export async function seedUser(opts: {
  handle: string;
  displayName: string;
  emailPrefix?: string;
}): Promise<SeededUser & { sessionUrl: string }> {
  const email = uniqueEmail(opts.emailPrefix ?? opts.handle);

  // Admin createUser bypasses email confirmation — straight to a
  // confirmed user we can immediately use.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true
  });
  if (createErr || !created.user) {
    throw new Error(`Could not create test user: ${createErr?.message}`);
  }
  const userId = created.user.id;

  // Profile + mixtape rows.
  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    handle: opts.handle,
    display_name: opts.displayName
  });
  if (profErr) throw new Error(`Could not create profile: ${profErr.message}`);

  const { error: mxErr } = await admin
    .from('mixtapes')
    .insert({ profile_id: userId, visibility: 'unlisted' });
  if (mxErr) throw new Error(`Could not create mixtape: ${mxErr.message}`);

  // Mint a magic-link "session" — this is the cleanest path to a
  // real authenticated browser session that doesn't require a UI
  // trip. The action_link is the same URL Supabase would send in the
  // magic-link email; navigating to it in the browser sets the
  // session cookie.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr || !link.properties?.action_link) {
    throw new Error(`Could not mint session: ${linkErr?.message}`);
  }

  return {
    id: userId,
    email,
    handle: opts.handle,
    displayName: opts.displayName,
    sessionUrl: link.properties.action_link
  };
}

/**
 * Wipe all test data created by the fixtures. Called between tests to
 * keep them independent. Uses the admin client so it bypasses RLS.
 *
 * Order matters: groups have `created_by` referencing profiles with
 * ON DELETE RESTRICT, so we have to drop the groups first or the user
 * delete cascade chokes. Group_memberships and mixtape_group_shares
 * cascade off the group delete, so we just need to clean up the
 * groups themselves before users.
 */
// Handles the test fixtures know how to seed. Used by the profile wipe
// below — deleting these clears the collision surface for the next test
// run without needing to enumerate auth.users (which the local
// Supabase stack's listUsers occasionally trips on).
const TEST_HANDLES = ['sam', 'tim'];

export async function wipeTestData(): Promise<void> {
  // 1. Drop test groups (slug prefix `e2e-`). Cascades to memberships,
  //    invites, mixtape_group_shares.
  const { error: groupsErr } = await admin.from('groups').delete().like('slug', 'e2e-%');
  if (groupsErr) throw new Error(`wipeTestData: groups delete failed: ${groupsErr.message}`);

  // 2. Drop known test profiles. Cascades to mixtapes → songs →
  //    stories. The orphan auth.users remain (each test gets a unique
  //    email via timestamp, so this doesn't affect isolation), which
  //    sidesteps a known bug in the local stack's listUsers admin RPC.
  const { error: profErr } = await admin
    .from('profiles')
    .delete()
    .in('handle', TEST_HANDLES);
  if (profErr) throw new Error(`wipeTestData: profiles delete failed: ${profErr.message}`);
}

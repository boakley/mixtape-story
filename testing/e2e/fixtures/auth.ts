// Seeded-session auth fixture.
//
// Per TESTING.md: most journeys start already authenticated. This
// fixture creates an auth.users + profile + mixtape via the Supabase
// admin API, signs the browser in via the test-only
// /api/test/session endpoint (which calls signInWithPassword through
// the SvelteKit SSR client and sets the right cookies), and hands the
// test a ready-to-go authenticated page.
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

// Fixed password assigned to every seeded user. Lets us trade the
// magic-link dance for a deterministic password sign-in — neither
// the user nor the test cares about the value.
const TEST_PASSWORD = 'e2e-fixture-password-do-not-ship';

// Parallel-safety: each Playwright worker gets a unique TEST_WORKER_INDEX
// (0, 1, 2, …). Suffixing handles with the worker index means parallel
// tests never collide on the profiles_handle_key unique constraint.
// The wipe function uses the same prefix pattern.
export function workerHandle(base: string): string {
  const idx = process.env.TEST_WORKER_INDEX ?? '0';
  return `${base}-w${idx}`;
}

/**
 * Create a new auth user, profile, and personal mixtape with a
 * worker-isolated handle. Callers pass the *base* handle (`sam`,
 * `tim`); the worker suffix is added here so each parallel worker
 * gets its own DB slot.
 */
export async function seedUser(opts: {
  baseHandle: string;
  displayName: string;
}): Promise<SeededUser & { password: string }> {
  const handle = workerHandle(opts.baseHandle);
  const email = uniqueEmail(handle);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true
  });
  if (createErr || !created.user) {
    throw new Error(`Could not create test user: ${createErr?.message}`);
  }
  const userId = created.user.id;

  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    handle,
    display_name: opts.displayName
  });
  if (profErr) throw new Error(`Could not create profile: ${profErr.message}`);

  const { error: mxErr } = await admin
    .from('mixtapes')
    .insert({ profile_id: userId, visibility: 'unlisted' });
  if (mxErr) throw new Error(`Could not create mixtape: ${mxErr.message}`);

  return {
    id: userId,
    email,
    password: TEST_PASSWORD,
    handle,
    displayName: opts.displayName
  };
}

/**
 * Wipe this worker's test data. Called from the `creator` fixture
 * setup so each test starts clean. Scoped to the worker's own
 * handle suffix so parallel workers never trample each other's data.
 *
 * Order matters: groups have `created_by` referencing profiles with
 * ON DELETE RESTRICT, so we drop the groups first or the user-delete
 * cascade chokes. Memberships, invites, and shares cascade off the
 * group delete; songs and stories cascade off the auth-user delete.
 */
export async function wipeTestData(): Promise<void> {
  const idx = process.env.TEST_WORKER_INDEX ?? '0';

  // 1. Drop groups slugged for this worker. Cascades to memberships,
  //    invites, mixtape_group_shares.
  const { error: groupsErr } = await admin
    .from('groups')
    .delete()
    .like('slug', `e2e-w${idx}-%`);
  if (groupsErr) throw new Error(`wipeTestData: groups delete failed: ${groupsErr.message}`);

  // 2. Look up worker-scoped profile leftovers, then delete via the
  //    auth admin API. profiles.id == auth.users.id by design, so
  //    deleting the auth user cascades the rest.
  const { data: leftovers, error: lookupErr } = await admin
    .from('profiles')
    .select('id')
    .like('handle', `%-w${idx}`);
  if (lookupErr) throw new Error(`wipeTestData: profiles lookup failed: ${lookupErr.message}`);

  for (const p of leftovers ?? []) {
    const { error: delErr } = await admin.auth.admin.deleteUser(p.id as string);
    if (delErr) throw new Error(`wipeTestData: deleteUser(${p.id}) failed: ${delErr.message}`);
  }
}

/**
 * Worker-scoped group slug. Used by tests so parallel runs each get
 * their own `e2e-w{N}-…` namespace and never see each other's groups.
 */
export function workerGroupSlug(base: string): string {
  const idx = process.env.TEST_WORKER_INDEX ?? '0';
  return `e2e-w${idx}-${base}`;
}

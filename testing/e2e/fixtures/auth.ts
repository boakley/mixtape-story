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
 * `roxanne`); the worker suffix is added here so each parallel worker
 * gets its own DB slot.
 */
export async function seedUser(opts: {
  baseHandle: string;
  displayName: string;
  /** Email domain. `e2e-admin.local` makes the user an admin via the
   *  ADMIN_EMAILS wildcard entry (see src/lib/server/admin.ts). */
  emailDomain?: string;
}): Promise<SeededUser & { password: string }> {
  const handle = workerHandle(opts.baseHandle);
  const email = uniqueEmail(handle).replace('@e2e.local', `@${opts.emailDomain ?? 'e2e.local'}`);

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

  // 2. Worker-scoped leftovers, deleted via the auth admin API
  //    (profiles.id == auth.users.id, so the user delete cascades the
  //    rest). Two marathon-run lessons baked in (the ×1000 run left
  //    6,912 users behind and degraded GoTrue into a failure spiral):
  //      - find users by their @e2e.local EMAIL, not via profiles —
  //        a test that dies before onboarding leaves a profile-less
  //        auth user a profiles join can never see;
  //      - never abort the sweep on one transient deleteUser failure
  //        (retry once, then skip — the next test's wipe gets it).
  const [{ data: page, error: lookupErr }, { data: profileRows, error: profErr }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from('profiles').select('id').like('handle', `%-w${idx}`)
    ]);
  if (lookupErr) throw new Error(`wipeTestData: listUsers failed: ${lookupErr.message}`);
  if (profErr) throw new Error(`wipeTestData: profiles lookup failed: ${profErr.message}`);

  // Union of three nets:
  //  - this worker's profiles (handle %-w{idx}) — catches magic-link
  //    users (joiner-{ts}@…) who completed onboarding onto a worker
  //    handle; their emails carry no worker marker;
  //  - this worker's seeded users by email marker;
  //  - profile-less @e2e.local users older than 10 minutes by their
  //    embedded timestamp (a test that died before onboarding —
  //    unclaimable per worker, so age-gated: a fresh one may belong
  //    to a sibling worker's in-flight test).
  const STALE_MS = 10 * 60 * 1000;
  const ids = new Set<string>((profileRows ?? []).map((p) => p.id as string));
  const mine = (page?.users ?? []).filter((u) => {
    if (ids.has(u.id)) return true;
    const email = u.email ?? '';
    if (new RegExp(`-w${idx}-\\d+-\\d+@(e2e|e2e-admin)\\.local$`).test(email)) return true;
    const anon = email.match(/^[a-z]+-(\d+)@(e2e|e2e-admin)\.local$/);
    return anon ? Date.now() - Number(anon[1]) > STALE_MS : false;
  });

  for (const u of mine) {
    let { error: delErr } = await admin.auth.admin.deleteUser(u.id);
    if (delErr) {
      await new Promise((r) => setTimeout(r, 500));
      ({ error: delErr } = await admin.auth.admin.deleteUser(u.id));
    }
    if (delErr) {
      console.warn(`wipeTestData: deleteUser(${u.id}) failed twice, skipping: ${delErr.message}`);
    }
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

/**
 * Seed a song directly into a profile's primary mixtape — for
 * multi-actor specs where walking the second actor through the
 * editor UI would test nothing new (stub at the data layer when the
 * flow isn't the thing under test).
 */
export async function seedSong(
  profileId: string,
  opts: { title: string; artist: string; position?: number }
): Promise<void> {
  const { data: mixtape, error: mxErr } = await admin
    .from('mixtapes')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (mxErr || !mixtape) throw new Error(`seedSong: no primary mixtape for ${profileId}`);

  const { error } = await admin.from('songs').insert({
    owner_id: profileId,
    mixtape_id: mixtape.id,
    position: opts.position ?? 1,
    title: opts.title,
    artist: opts.artist,
    link_status: 'manual'
  });
  if (error) throw new Error(`seedSong(${opts.title}): ${error.message}`);
}

/**
 * Make a profile a member of a group (by slug) and share their
 * primary mixtape into it — the data-layer equivalent of the
 * invite-join + share-button journey, for specs where that journey
 * isn't the subject (it has its own coverage in 08/09).
 */
export async function seedGroupMember(groupSlug: string, profileId: string): Promise<void> {
  const { data: group, error: gErr } = await admin
    .from('groups')
    .select('id')
    .eq('slug', groupSlug)
    .maybeSingle();
  if (gErr || !group) throw new Error(`seedGroupMember: no group ${groupSlug}`);

  const { error: memErr } = await admin
    .from('group_memberships')
    .insert({ group_id: group.id, profile_id: profileId, role: 'member' });
  if (memErr) throw new Error(`seedGroupMember membership: ${memErr.message}`);

  const { data: mixtape, error: mxErr } = await admin
    .from('mixtapes')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (mxErr || !mixtape) throw new Error(`seedGroupMember: no primary mixtape for ${profileId}`);

  const { error: shareErr } = await admin
    .from('mixtape_group_shares')
    .insert({ mixtape_id: mixtape.id, group_id: group.id });
  if (shareErr) throw new Error(`seedGroupMember share: ${shareErr.message}`);
}

/**
 * For tests that need a real Listen <a> link to render (rather than
 * the disabled `→ Listen` span or the PreviewButton), mark every song
 * owned by a profile as resolved. Sets `link_status='done'` with a
 * placeholder `songlink_url` so SongRow's listenHref returns a usable
 * destination when there's no preference.
 *
 * Per-platform deep links aren't populated, so once the visitor picks
 * a service the listenHref falls through to the service's public
 * search URL — that's still a valid "Listen with this service"
 * destination and any assertion that checks the URL's host will be
 * satisfied.
 *
 * Use this when a test's intent is to exercise the Listen-click path
 * (the chooser modal, deep-link routing) rather than the resolver.
 */
export async function markAllSongsResolved(profileId: string): Promise<void> {
  const { error } = await admin
    .from('songs')
    .update({
      link_status: 'done',
      songlink_url: 'https://song.link/i/0000000000'
    })
    .eq('owner_id', profileId);
  if (error) throw new Error(`markAllSongsResolved(${profileId}): ${error.message}`);
}

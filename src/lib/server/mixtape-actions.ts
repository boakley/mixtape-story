import { error, redirect } from '@sveltejs/kit';
import { adminClient } from './supabase-admin';

// Entry guard for the inline-edit actions on /{handle} — title and
// description. Mirrors the requireGroupRole shape over in
// group-actions.ts: hard denials (no session, profile missing) throw
// SvelteKit's matching error/redirect so they bubble; the soft denial
// (signed in but not the owner of this handle) returns ok=false so the
// action can wrap it in fail(status, { name: { error: m } }) with its
// payload-namespace key. No feature gate — the personal mixtape pages
// aren't behind a flag.

type Locals = App.Locals;
type Params = { handle: string };

type SessionResult = Awaited<ReturnType<Locals['safeGetSession']>>;
type AuthUser = NonNullable<SessionResult['user']>;
type AdminClient = ReturnType<typeof adminClient>;

type MixtapeOwnerContext = {
  user: AuthUser;
  admin: AdminClient;
  profile: { id: string; handle: string; display_name: string };
  mixtape: { id: string };
};

type Allowed = { ok: true } & MixtapeOwnerContext;
type Denied = { ok: false; status: number; message: string };

export type MixtapeOwnerResult = Allowed | Denied;

export async function requireMixtapeOwner(
  params: Params,
  locals: Locals
): Promise<MixtapeOwnerResult> {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/login');

  const admin = adminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id, handle, display_name')
    .eq('handle', params.handle)
    .maybeSingle();
  if (!profile) throw error(404, 'Mixtape not found');

  if (user.id !== profile.id) {
    return { ok: false, status: 403, message: 'Not your mixtape.' };
  }

  // Migration 0016 nulled `group_id` on every personal mixtape and
  // we don't write non-null group_ids back in v1, so a profile has
  // exactly one mixtape row. The earlier `.is('group_id', null)`
  // filter looked defensive but doesn't actually match against
  // seeded data — same fix as the personalMixtape load query.
  const { data: mixtape } = await admin
    .from('mixtapes')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (!mixtape) {
    return { ok: false, status: 500, message: 'No mixtape to edit. Contact support.' };
  }

  return {
    ok: true,
    user,
    admin,
    profile: {
      id: profile.id as string,
      handle: profile.handle as string,
      display_name: profile.display_name as string
    },
    mixtape: { id: mixtape.id as string }
  };
}

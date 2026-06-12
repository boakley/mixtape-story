import { error, redirect } from '@sveltejs/kit';
import { adminClient } from './supabase-admin';

// Entry guard for anything that edits a mixtape — the inline-edit
// actions on the reader, every editor action, and the editor load.
// Mirrors the requireGroupRole shape over in group-actions.ts: hard
// denials (no session, profile missing) throw SvelteKit's matching
// error/redirect so they bubble; soft denials (signed in but not the
// owner; slugged mixtape that doesn't exist) return ok=false so the
// caller can wrap them in fail(...) with its payload shape.
//
// Slug semantics (v1.5): no slug → the primary (slug is null in the
// schema; exactly one per profile). A slug → that group-born mixtape;
// missing is a 404-shaped denial, not a 500 — secondaries legitimately
// come and go, the primary doesn't.

type Locals = Pick<App.Locals, 'safeGetSession'>;
type Params = { handle: string; slug?: string };

type SessionResult = Awaited<ReturnType<App.Locals['safeGetSession']>>;
type AuthUser = NonNullable<SessionResult['user']>;
type AdminClient = ReturnType<typeof adminClient>;

type MixtapeOwnerContext = {
  user: AuthUser;
  admin: AdminClient;
  profile: { id: string; handle: string; display_name: string };
  mixtape: { id: string; slug: string | null; name: string | null };
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

  let query = admin.from('mixtapes').select('id, slug, name').eq('profile_id', user.id);
  query = params.slug ? query.eq('slug', params.slug) : query.is('slug', null);
  const { data: mixtape } = await query.maybeSingle();

  if (!mixtape) {
    return params.slug
      ? { ok: false, status: 404, message: 'Mixtape not found' }
      : { ok: false, status: 500, message: 'No mixtape to edit. Contact support.' };
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
    mixtape: {
      id: mixtape.id as string,
      slug: (mixtape.slug as string | null) ?? null,
      name: (mixtape.name as string | null) ?? null
    }
  };
}

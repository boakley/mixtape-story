import { error, redirect } from '@sveltejs/kit';
import { isFeatureAvailable } from './features';
import { adminClient } from './supabase-admin';

// Common entry guards for the six /g/{slug} form actions. Every action
// repeats the same opening prelude (feature gate → user check → group
// lookup → optional membership/role check). Centralizing it here keeps
// the policy in one place and drops each action body by ~15 lines.
//
// Two helpers, two shapes:
//
//   `requireGroupAccess` — for actions that don't gate on role (user
//   doing something to their own data, like unshareFrom). Throws the
//   matching SvelteKit error/redirect on a hard denial; returns
//   { user, admin, group } directly on success.
//
//   `requireGroupRole` — for actions gated on membership or steward
//   role. Same hard-denial behavior, plus a soft-denial return shape
//   so the caller can wrap it in fail(status, { x: { error: m } })
//   with their action-specific payload namespace.

type Locals = App.Locals;
type Params = { slug: string };
type Role = 'member' | 'steward';

// Sourced from the existing return types rather than re-imported from
// @supabase/supabase-js — keeps the helper aligned with how the rest
// of the codebase types these implicitly.
type SessionResult = Awaited<ReturnType<Locals['safeGetSession']>>;
type AuthUser = NonNullable<SessionResult['user']>;
type AdminClient = ReturnType<typeof adminClient>;

type GroupContext = {
  user: AuthUser;
  admin: AdminClient;
  group: { id: string };
};

type Allowed = { ok: true } & GroupContext;
type Denied = { ok: false; status: number; message: string };

export type GroupRoleResult = Allowed | Denied;

export async function requireGroupAccess(
  params: Params,
  locals: Locals
): Promise<GroupContext> {
  // Get the user before the feature gate so admin-bypass works: an
  // admin visiting a flag-off feature in prod sees the page; everyone
  // else gets a 404 as if the route didn't exist.
  const { user } = await locals.safeGetSession();
  if (!isFeatureAvailable('groups', user)) throw error(404, 'Not Found');
  if (!user) throw redirect(303, '/login');

  const admin = adminClient();

  const { data: group } = await admin
    .from('groups')
    .select('id')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!group) throw error(404, 'Group not found');

  return { user, admin, group };
}

export async function requireGroupRole(
  params: Params,
  locals: Locals,
  role: Role
): Promise<GroupRoleResult> {
  const ctx = await requireGroupAccess(params, locals);

  const { data: membership } = await ctx.admin
    .from('group_memberships')
    .select('role')
    .eq('group_id', ctx.group.id)
    .eq('profile_id', ctx.user.id)
    .maybeSingle();

  if (role === 'member' && !membership) {
    return { ok: false, status: 403, message: 'Join this group first.' };
  }

  if (role === 'steward' && membership?.role !== 'steward') {
    return { ok: false, status: 403, message: 'Stewards only.' };
  }

  return { ok: true, ...ctx };
}

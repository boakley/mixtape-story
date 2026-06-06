import { error, redirect } from '@sveltejs/kit';
import { isFeatureEnabled } from '$lib/server/features';
import { adminClient } from '$lib/server/supabase-admin';
import type { PageServerLoad } from './$types';

// Signed-in invite acceptance. The brand-new-visitor flow (magic-link
// carrying invite intent) lands in step 8; this route handles users
// already signed in. Anyone unauthenticated gets sent to /login for now.
//
// Error-state policy follows design-groups.md: friendly + deliberately
// under-informative. Revoked / expired / used-up / never-existed all
// surface the same "no longer active" message — prevents brute-force
// enumeration and doesn't leak steward behavior.

function gate() {
  if (!isFeatureEnabled('groups')) throw error(404, 'Not Found');
}

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
  gate();

  const { user } = await safeGetSession();
  if (!user) {
    // Step 8 will replace this with magic-link-carrying-intent so a
    // brand-new visitor can sign up and join in one step. For now,
    // signed-out users get sent to /login and have to come back.
    const back = `/g/${params.slug}/i/${params.code}`;
    throw redirect(303, `/login?redirect=${encodeURIComponent(back)}`);
  }

  const admin = adminClient();

  // The group has to exist; if not, 404 (slug-existence isn't a probe
  // the route handler should help with).
  const { data: group } = await admin
    .from('groups')
    .select('id, slug, name')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!group) throw error(404, 'Group not found');

  // Already a member → redirect to the landing with a flash-ish state.
  // The landing already renders the right member view.
  const { data: membership } = await admin
    .from('group_memberships')
    .select('role')
    .eq('group_id', group.id)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (membership) throw redirect(303, `/g/${group.slug}?already=1`);

  // Validate the code. All failure paths render the same friendly
  // message, intentionally under-informative.
  const { data: invite } = await admin
    .from('group_invites')
    .select('id, code, expires_at, revoked_at, uses_remaining')
    .eq('group_id', group.id)
    .eq('code', params.code)
    .maybeSingle();

  const now = Date.now();
  const stillUsable =
    invite &&
    invite.revoked_at === null &&
    (invite.expires_at === null || new Date(invite.expires_at as string).getTime() > now) &&
    (invite.uses_remaining === null || (invite.uses_remaining as number) > 0);

  if (!stillUsable) {
    return {
      group: { name: group.name as string, slug: group.slug as string },
      status: 'invalid' as const
    };
  }

  // A handle is required before joining — without it, the steward view
  // and member directory can't render attribution. Stash the invite URL
  // on the redirect so the user comes back here after picking a handle.
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) {
    const back = `/g/${group.slug}/i/${params.code}`;
    throw redirect(303, `/onboarding?redirect=${encodeURIComponent(back)}`);
  }

  // Atomic-ish: insert the membership, then decrement uses if a cap
  // exists. Insert can fail on the partial unique PK (already a member,
  // race condition with the earlier check) — treat that as success.
  const { error: insertError } = await admin
    .from('group_memberships')
    .insert({ group_id: group.id, profile_id: user.id, role: 'member' });
  if (insertError && insertError.code !== '23505') {
    return {
      group: { name: group.name as string, slug: group.slug as string },
      status: 'error' as const
    };
  }

  if (invite!.uses_remaining !== null) {
    await admin
      .from('group_invites')
      .update({ uses_remaining: (invite!.uses_remaining as number) - 1 })
      .eq('id', invite!.id);
  }

  throw redirect(303, `/g/${group.slug}?joined=1`);
};

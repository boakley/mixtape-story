import { error, fail, redirect } from '@sveltejs/kit';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { isFeatureAvailable } from '$lib/server/features';
import { adminClient } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

// Invite acceptance. Two paths:
//
//   1. Brand-new visitor (anon)   — sees a welcome page with the group's
//      name + a one-line product blurb + an email form. Submitting the
//      form sends a magic link whose `emailRedirectTo` points back at
//      this same invite URL. After verification, they re-enter this
//      load with a session, and the signed-in path takes over.
//
//   2. Signed-in user             — code is validated, membership is
//      inserted, use count decremented, redirected to /g/{slug}.
//
// The intent rides in the URL itself — *not* a session cookie. That
// matters because the most common flow is "type email on the laptop,
// click magic link from the phone." A cookie-based redirect would
// silently lose the invite intent on a device switch.
//
// Error-state policy follows design-groups.md: friendly + deliberately
// under-informative. Revoked / expired / used-up / never-existed all
// surface the same "no longer active" message — prevents brute-force
// enumeration and doesn't leak steward behavior.

function gate(user: { email?: string | null } | null) {
  if (!isFeatureAvailable('groups', user)) throw error(404, 'Not Found');
}

type AnonState =
  | { status: 'welcome'; group: { name: string; slug: string } }
  | { status: 'invalid'; group: { name: string; slug: string } };

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
  // Get user before the gate so admin-bypass works.
  const { user: gateUser } = await safeGetSession();
  gate(gateUser);

  const admin = adminClient();

  // The group has to exist; if not, 404 (slug-existence isn't a probe
  // the route handler should help with).
  const { data: group } = await admin
    .from('groups')
    .select('id, slug, name')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!group) throw error(404, 'Group not found');

  // Validate the code before showing the welcome page. We render the
  // same "no longer active" copy regardless of which signed-in/anon
  // state we're in — no enumeration leak.
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

  const { user } = await safeGetSession();

  if (!user) {
    // Anon path: show the welcome form (or the invalid-invite page).
    const anonState: AnonState = stillUsable
      ? { status: 'welcome', group: { name: group.name as string, slug: group.slug as string } }
      : { status: 'invalid', group: { name: group.name as string, slug: group.slug as string } };
    return anonState;
  }

  // Already a member → redirect to the landing with a flash-ish state.
  // The landing already renders the right member view.
  const { data: membership } = await admin
    .from('group_memberships')
    .select('role')
    .eq('group_id', group.id)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (membership) throw redirect(303, `/g/${group.slug}?already=1`);

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

export const actions: Actions = {
  // Brand-new visitor submits their email. Send a magic link whose
  // `emailRedirectTo` carries the invite URL as the `next` param so
  // post-verification they land right back here and the signed-in load
  // takes over.
  requestInvite: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    gate(user);

    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim();

    if (!email || !email.includes('@')) {
      return fail(400, { email, error: 'Please enter a valid email address.' });
    }

    const back = `/g/${params.slug}/i/${params.code}`;
    const emailRedirectTo = `${PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(back)}`;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo }
    });
    if (otpError) {
      return fail(500, { email, error: otpError.message });
    }

    return { email, sent: true };
  }
};

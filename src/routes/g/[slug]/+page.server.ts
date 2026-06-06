import { error, fail, redirect } from '@sveltejs/kit';
import { isFeatureEnabled } from '$lib/server/features';
import { adminClient } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

// The group landing page. Anyone can see name + description; only members
// see the member-mixtapes list. Songs we share / All songs tabs land later.

function gate() {
  if (!isFeatureEnabled('groups')) throw error(404, 'Not Found');
}

type MemberMixtape = {
  handle: string;
  displayName: string;
  songCount: number;
  updatedAt: string;
};

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
  gate();

  const { user } = await safeGetSession();
  const admin = adminClient();

  // Group lookup. service_role because we want to distinguish "exists" from
  // "you can't see it" — the RLS allows anyone to SELECT groups, but this
  // sidesteps a duplicate hop.
  const { data: group } = await admin
    .from('groups')
    .select('id, slug, name, description, created_at')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!group) throw error(404, 'Group not found');

  let isMember = false;
  let viewerHasGroupMixtape = false;
  let viewerHasPersonalMixtape = false;
  if (user) {
    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    isMember = !!membership;

    if (isMember) {
      const { data: existing } = await admin
        .from('mixtapes')
        .select('id, group_id')
        .eq('profile_id', user.id);
      viewerHasGroupMixtape = (existing ?? []).some((m) => m.group_id === group.id);
      viewerHasPersonalMixtape = (existing ?? []).some((m) => m.group_id === null);
    }
  }

  let memberCount = 0;
  let mixtapes: MemberMixtape[] = [];

  if (isMember) {
    const { count } = await admin
      .from('group_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', group.id);
    memberCount = count ?? 0;

    // Member mixtapes — only the rows scoped to this group.
    const { data: rows } = await admin
      .from('mixtapes')
      .select(`
        id, updated_at,
        profile:profiles!inner ( handle, display_name ),
        songs:songs ( id )
      `)
      .eq('group_id', group.id)
      .order('updated_at', { ascending: false });

    mixtapes =
      (rows ?? []).map((r) => {
        const profile = r.profile as unknown as { handle: string; display_name: string };
        const songs = r.songs as unknown as { id: string }[];
        return {
          handle: profile.handle,
          displayName: profile.display_name,
          songCount: songs.length,
          updatedAt: r.updated_at as string
        };
      });
  }

  return {
    group: {
      slug: group.slug as string,
      name: group.name as string,
      description: group.description as string
    },
    isMember,
    memberCount,
    mixtapes,
    viewerHasGroupMixtape,
    viewerHasPersonalMixtape
  };
};

// Minimal "move my personal mixtape into this group" action, so a freshly
// created group has something to render on the landing page without
// shipping the full move-between-scopes UI from step 12. v1 of the move
// flow proper will live in mixtape settings; this is the stepping-stone.
export const actions: Actions = {
  moveIn: async ({ params, locals: { safeGetSession } }) => {
    gate();
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const admin = adminClient();

    const { data: group } = await admin
      .from('groups')
      .select('id')
      .eq('slug', params.slug)
      .maybeSingle();
    if (!group) throw error(404, 'Group not found');

    // Must be a member of this group to put a mixtape in it.
    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!membership) return fail(403, { error: 'Join this group first.' });

    // Move the user's personal mixtape into this group. If they don't
    // have one yet, create a fresh group-scoped mixtape directly.
    const { data: personal } = await admin
      .from('mixtapes')
      .select('id, group_id, visibility')
      .eq('profile_id', user.id)
      .is('group_id', null)
      .maybeSingle();

    if (personal) {
      const { error: updateError } = await admin
        .from('mixtapes')
        .update({ group_id: group.id, visibility: 'group' })
        .eq('id', personal.id);
      if (updateError) return fail(500, { error: 'Could not move your mixtape.' });
    } else {
      const { error: insertError } = await admin
        .from('mixtapes')
        .insert({
          profile_id: user.id,
          group_id: group.id,
          visibility: 'group'
        });
      if (insertError) return fail(500, { error: 'Could not add your mixtape.' });
    }

    // Stay on the landing page so the move is visible immediately.
    return { ok: true };
  }
};

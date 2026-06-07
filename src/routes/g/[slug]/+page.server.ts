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
  // The viewer's own mixtape shows on the landing even when empty
  // (with a "Add a song to make this visible" hint), so they can see
  // themselves while contributing. Other members' empty mixtapes are
  // filtered out — the directory is "look what we've made", not a
  // roster of who joined.
  isViewer: boolean;
};

type InviteRow = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usesRemaining: number | null;
};

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/;

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
  let isSteward = false;
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
    isSteward = membership?.role === 'steward';

    if (isMember) {
      // Under share semantics each user has exactly one mixtape entity.
      // The UI needs two facts:
      //   - Does the user have a mixtape at all? (controls whether
      //     "Share with this group" makes sense)
      //   - Is that mixtape already shared with this group? (controls
      //     whether the button reads "Share" or "Stop sharing")
      const { data: mixtape } = await admin
        .from('mixtapes')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();
      viewerHasPersonalMixtape = !!mixtape;
      if (mixtape) {
        const { data: share } = await admin
          .from('mixtape_group_shares')
          .select('mixtape_id')
          .eq('mixtape_id', mixtape.id)
          .eq('group_id', group.id)
          .maybeSingle();
        viewerHasGroupMixtape = !!share;
      }
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

    // Member mixtapes — every mixtape shared with this group, with
    // owner identity and song count for the directory row.
    const { data: rows } = await admin
      .from('mixtape_group_shares')
      .select(`
        mixtape:mixtapes!inner (
          id, profile_id, updated_at,
          profile:profiles!inner ( handle, display_name ),
          songs:songs ( id )
        )
      `)
      .eq('group_id', group.id);

    type ShareRow = {
      mixtape: {
        profile_id: string;
        updated_at: string;
        profile: { handle: string; display_name: string };
        songs: { id: string }[];
      };
    };
    mixtapes = (rows as unknown as ShareRow[] ?? [])
      .map((r) => ({
        handle: r.mixtape.profile.handle,
        displayName: r.mixtape.profile.display_name,
        songCount: r.mixtape.songs.length,
        updatedAt: r.mixtape.updated_at,
        isViewer: r.mixtape.profile_id === user?.id
      }))
      // Empty mixtapes don't appear on the landing — directory is for
      // "look what we've made", not a join roster. The viewer's own
      // mixtape is the one exception so they can see themselves while
      // contributing.
      .filter((m) => m.songCount > 0 || m.isViewer)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // The header meta line counts "real" mixtapes — ones the group has
  // actually made. The viewer's own empty row (when present) appears in
  // `mixtapes` for UX but isn't counted toward this number.
  const activeMixtapeCount = mixtapes.filter((m) => m.songCount > 0).length;

  // Stewards see their active (non-revoked) invite codes inline on the
  // landing — list + a form to mint a new code. A separate /manage
  // page can split this out later if it gets crowded.
  let invites: InviteRow[] = [];
  if (isSteward) {
    const { data: inviteRows } = await admin
      .from('group_invites')
      .select('id, code, created_at, expires_at, uses_remaining')
      .eq('group_id', group.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    invites = (inviteRows ?? []).map((i) => ({
      id: i.id as string,
      code: i.code as string,
      createdAt: i.created_at as string,
      expiresAt: i.expires_at as string | null,
      usesRemaining: i.uses_remaining as number | null
    }));
  }

  return {
    group: {
      slug: group.slug as string,
      name: group.name as string,
      description: group.description as string
    },
    isMember,
    isSteward,
    memberCount,
    mixtapes,
    activeMixtapeCount,
    viewerHasGroupMixtape,
    viewerHasPersonalMixtape,
    invites
  };
};

// Share semantics: a user has one mixtape entity, which can be visible
// in N groups via the mixtape_group_shares join table. Edits to the
// mixtape propagate to every group it's shared with because there's
// only one row. To make a divergent version for a specific audience,
// the user creates a different mixtape entity (v1.5+).
export const actions: Actions = {
  // Share the user's mixtape with this group. Idempotent — the PK on
  // (mixtape_id, group_id) makes duplicate inserts a no-op.
  shareWith: async ({ params, locals: { safeGetSession } }) => {
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

    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!membership) return fail(403, { error: 'Join this group first.' });

    const { data: mixtape } = await admin
      .from('mixtapes')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!mixtape) return fail(500, { error: 'No mixtape to share. Contact support.' });

    const { error: shareError } = await admin
      .from('mixtape_group_shares')
      .upsert(
        { mixtape_id: mixtape.id, group_id: group.id },
        { onConflict: 'mixtape_id,group_id' }
      );
    if (shareError) return fail(500, { error: 'Could not share your mixtape.' });

    return { ok: true };
  },

  // Stop sharing the user's mixtape with this group. Reverses shareWith
  // (without touching the underlying mixtape or its songs/stories).
  unshareFrom: async ({ params, locals: { safeGetSession } }) => {
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

    const { data: mixtape } = await admin
      .from('mixtapes')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!mixtape) return { ok: true };

    await admin
      .from('mixtape_group_shares')
      .delete()
      .eq('mixtape_id', mixtape.id)
      .eq('group_id', group.id);

    return { ok: true };
  },

  // Steward mints a new invite code. Code is human-pickable, validated
  // against the same regex baked into the schema; optional expiry and
  // optional use cap default to "never expires, unlimited uses".
  createInvite: async ({ params, request, locals: { safeGetSession } }) => {
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

    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (membership?.role !== 'steward') {
      return fail(403, { invite: { error: 'Stewards only.' } });
    }

    const data = await request.formData();
    const code = String(data.get('code') ?? '').trim().toLowerCase();
    const expiresInDays = String(data.get('expires_in_days') ?? '').trim();
    const usesCap = String(data.get('uses_cap') ?? '').trim();

    if (!code || !CODE_RE.test(code)) {
      return fail(400, {
        invite: { code, expiresInDays, usesCap, error: 'Code must be 4–32 lowercase characters, digits, or hyphens; not start or end with a hyphen.' }
      });
    }

    let expiresAt: string | null = null;
    if (expiresInDays) {
      const days = Number(expiresInDays);
      if (!Number.isFinite(days) || days <= 0 || days > 365) {
        return fail(400, { invite: { code, expiresInDays, usesCap, error: 'Expiry must be between 1 and 365 days.' } });
      }
      expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    }

    let usesRemaining: number | null = null;
    if (usesCap) {
      const n = Number(usesCap);
      if (!Number.isFinite(n) || n <= 0 || n > 1000) {
        return fail(400, { invite: { code, expiresInDays, usesCap, error: 'Use cap must be between 1 and 1000.' } });
      }
      usesRemaining = n;
    }

    const { error: insertError } = await admin.from('group_invites').insert({
      group_id: group.id,
      code,
      created_by: user.id,
      expires_at: expiresAt,
      uses_remaining: usesRemaining
    });
    if (insertError) {
      // 23505 = unique_violation on (group_id, code).
      if (insertError.code === '23505') {
        return fail(409, { invite: { code, expiresInDays, usesCap, error: 'That code already exists for this group.' } });
      }
      return fail(500, { invite: { code, expiresInDays, usesCap, error: 'Could not create the invite. Try again.' } });
    }

    return { invite: { ok: true } };
  },

  // Steward revokes an invite. Soft revoke (sets revoked_at) so
  // historical clicks render a stable "no longer active" message.
  revokeInvite: async ({ params, request, locals: { safeGetSession } }) => {
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

    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (membership?.role !== 'steward') return fail(403, { invite: { error: 'Stewards only.' } });

    const data = await request.formData();
    const inviteId = String(data.get('invite_id') ?? '');
    if (!inviteId) return fail(400, { invite: { error: 'Missing invite id.' } });

    await admin
      .from('group_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('group_id', group.id);

    return { invite: { ok: true } };
  },

  // Steward edits the group description inline. Empty string is a valid
  // value (clears the description). Capped at 500 chars to keep the
  // landing header from turning into a wall of text.
  editDescription: async ({ params, request, locals: { safeGetSession } }) => {
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

    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (membership?.role !== 'steward') {
      return fail(403, { description: { error: 'Stewards only.' } });
    }

    const data = await request.formData();
    const description = String(data.get('description') ?? '').trim();
    if (description.length > 500) {
      return fail(400, {
        description: { value: description, error: 'Description must be 500 characters or fewer.' }
      });
    }

    const { error: updateError } = await admin
      .from('groups')
      .update({ description })
      .eq('id', group.id);
    if (updateError) {
      return fail(500, { description: { value: description, error: 'Could not save. Try again.' } });
    }

    return { description: { ok: true } };
  },

  // Steward edits the group name inline. Mostly a typo-correction escape
  // hatch — the expected rate is roughly never, but a misspelling caught
  // right after creation shouldn't force re-creating the group. Capped at
  // 100 chars; non-empty.
  editName: async ({ params, request, locals: { safeGetSession } }) => {
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

    const { data: membership } = await admin
      .from('group_memberships')
      .select('role')
      .eq('group_id', group.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (membership?.role !== 'steward') {
      return fail(403, { name: { error: 'Stewards only.' } });
    }

    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      return fail(400, { name: { value: name, error: 'Name can’t be empty.' } });
    }
    if (name.length > 100) {
      return fail(400, { name: { value: name, error: 'Name must be 100 characters or fewer.' } });
    }

    const { error: updateError } = await admin
      .from('groups')
      .update({ name })
      .eq('id', group.id);
    if (updateError) {
      return fail(500, { name: { value: name, error: 'Could not save. Try again.' } });
    }

    return { name: { ok: true } };
  }
};

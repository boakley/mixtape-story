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
        id, profile_id, updated_at,
        profile:profiles!inner ( handle, display_name ),
        songs:songs ( id )
      `)
      .eq('group_id', group.id)
      .order('updated_at', { ascending: false });

    mixtapes = (rows ?? [])
      .map((r) => {
        const profile = r.profile as unknown as { handle: string; display_name: string };
        const songs = r.songs as unknown as { id: string }[];
        return {
          handle: profile.handle,
          displayName: profile.display_name,
          songCount: songs.length,
          updatedAt: r.updated_at as string,
          isViewer: r.profile_id === user?.id
        };
      })
      // Empty mixtapes don't appear on the landing — directory is for
      // "look what we've made", not a join roster. The viewer's own
      // mixtape is the one exception so they can see themselves while
      // contributing.
      .filter((m) => m.songCount > 0 || m.isViewer);
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

// "Copy my mixtape here" — duplicates the user's personal mixtape (rows
// in songs + stories) into a new group-scoped mixtape row. The personal
// mixtape is left untouched, so:
//   - /{handle} keeps showing the user's personal mixtape.
//   - The user can join multiple groups and copy into each.
//   - The two copies diverge independently after the copy point — drop a
//     song from the group mixtape and the personal version still has it.
// If the user has no personal mixtape (edge case for fresh signups
// pre-onboarding-fix), a fresh empty group mixtape is created instead.
export const actions: Actions = {
  copyIn: async ({ params, locals: { safeGetSession } }) => {
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

    // Idempotent: if the user already has a mixtape in this group, do
    // nothing. The partial unique index would catch a duplicate, but
    // an early return surfaces a friendlier UI state than a constraint
    // error.
    const { data: existingGroupMixtape } = await admin
      .from('mixtapes')
      .select('id')
      .eq('profile_id', user.id)
      .eq('group_id', group.id)
      .maybeSingle();
    if (existingGroupMixtape) return { ok: true };

    // Pull the source mixtape (personal scope) along with its songs.
    // Stories come in a second query keyed by song_id to keep this
    // single select small.
    const { data: source } = await admin
      .from('mixtapes')
      .select(`
        id,
        songs:songs (
          id, position, title, artist, album, release_year, memory_year,
          isrc, album_art_url, source_url, songlink_url, link_status,
          link_attempts, link_last_attempt, link_last_error, preview_url,
          links_by_platform, added_at
        )
      `)
      .eq('profile_id', user.id)
      .is('group_id', null)
      .maybeSingle();

    const { data: newMixtape, error: mixtapeError } = await admin
      .from('mixtapes')
      .insert({ profile_id: user.id, group_id: group.id, visibility: 'group' })
      .select('id')
      .single();
    if (mixtapeError || !newMixtape) {
      return fail(500, { error: 'Could not create the group mixtape.' });
    }

    type SourceSong = {
      id: string;
      position: number;
      title: string;
      artist: string | null;
      album: string | null;
      release_year: number | null;
      memory_year: number | null;
      isrc: string | null;
      album_art_url: string | null;
      source_url: string | null;
      songlink_url: string | null;
      link_status: string;
      link_attempts: number;
      link_last_attempt: string | null;
      link_last_error: string | null;
      preview_url: string | null;
      links_by_platform: Record<string, { url: string }> | null;
      added_at: string;
    };
    const sourceSongs = (source?.songs ?? []) as SourceSong[];
    if (sourceSongs.length === 0) {
      // Nothing to copy — fresh empty group mixtape is the result.
      return { ok: true };
    }

    // Pre-generate UUIDs so we can map old song.id → new song.id for
    // the story copy that follows.
    const idMap = new Map<string, string>();
    const newSongRows = sourceSongs.map((s) => {
      const newId = crypto.randomUUID();
      idMap.set(s.id, newId);
      return {
        id: newId,
        owner_id: user.id,
        mixtape_id: newMixtape.id,
        position: s.position,
        title: s.title,
        artist: s.artist,
        album: s.album,
        release_year: s.release_year,
        memory_year: s.memory_year,
        isrc: s.isrc,
        album_art_url: s.album_art_url,
        source_url: s.source_url,
        songlink_url: s.songlink_url,
        link_status: s.link_status,
        link_attempts: s.link_attempts,
        link_last_attempt: s.link_last_attempt,
        link_last_error: s.link_last_error,
        preview_url: s.preview_url,
        links_by_platform: s.links_by_platform,
        added_at: s.added_at
      };
    });

    const { error: songsError } = await admin.from('songs').insert(newSongRows);
    if (songsError) {
      // Roll back the orphan mixtape so the user can retry cleanly.
      await admin.from('mixtapes').delete().eq('id', newMixtape.id);
      return fail(500, { error: 'Could not copy your songs.' });
    }

    // Copy stories, mapping old song_id → new song_id.
    const oldSongIds = sourceSongs.map((s) => s.id);
    const { data: sourceStories } = await admin
      .from('stories')
      .select('song_id, text, updated_at')
      .in('song_id', oldSongIds);

    const newStoryRows = (sourceStories ?? [])
      .map((s) => {
        const newSongId = idMap.get(s.song_id as string);
        if (!newSongId) return null;
        return { song_id: newSongId, text: s.text as string, updated_at: s.updated_at as string };
      })
      .filter((r): r is { song_id: string; text: string; updated_at: string } => r !== null);

    if (newStoryRows.length > 0) {
      await admin.from('stories').insert(newStoryRows);
    }

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
  }
};

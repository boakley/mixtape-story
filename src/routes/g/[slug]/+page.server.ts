import { error, fail } from '@sveltejs/kit';
import { adminClient } from '$lib/server/supabase-admin';
import { requireGroupAccess, requireGroupRole } from '$lib/server/group-actions';
import { renderStory } from '$lib/server/markdown';
import { truncateStory, normalizeSongKey } from '$lib/server/story-truncate';
import { LISTEN_PREF_COOKIE, isListenPref, type ListenPref } from '$lib/listen';
import type { PlatformLinks } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

// The group landing page. Anyone can see name + description; only members
// see the member-mixtapes list. Songs we share / All songs tabs land later.

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

// Per-contributor entry on an aggregated song. Stories are pre-rendered
// (excerpt + full) so the client can toggle without round-tripping.
type SongContributor = {
  handle: string;
  displayName: string;
  memoryYear: number | null;
  storyExcerptHtml: string;
  storyFullHtml: string;
  storyIsTruncated: boolean;
  addedAt: string;
};

// Aggregated "song" entry for the Songs-we-share and All-songs tabs.
// One row per dedup key (ISRC when present, else normalized title+artist).
// Canonical metadata is the first contributor's, upgraded as later
// contributors fill in nulls (e.g., first hit has no album art, second does).
type AggregatedSong = {
  dedupKey: string;
  title: string;
  artist: string | null;
  album: string | null;
  songlinkUrl: string | null;
  linksByPlatform: PlatformLinks | null;
  contributors: SongContributor[];
  newestAddedAt: string;
};

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/;

export const load: PageServerLoad = async ({ params, cookies, locals: { safeGetSession } }) => {
  // Get user before the gate so admin-bypass works.
  const { user } = await safeGetSession();

  const admin = adminClient();

  // Visitor "Listen with" preference, read from the same cookie the
  // personal mixtape page uses. Carries the visitor's choice across
  // pages (cookie is path=/), so a steward who set Apple Music there
  // gets Apple Music deep-links here too.
  const rawPref = cookies.get(LISTEN_PREF_COOKIE);
  const viewerPref: ListenPref | null = isListenPref(rawPref) ? rawPref : null;

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
  let aggregatedSongs: AggregatedSong[] = [];

  if (isMember) {
    const { count } = await admin
      .from('group_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', group.id);
    memberCount = count ?? 0;

    // One query covers both the Member-mixtapes directory and the
    // song-level aggregation for the Songs-we-share / All-songs tabs.
    // At writing-group scale (≤20 members × ≤30 songs each) the row
    // count is small; computing aggregates in JS beats a materialized
    // view that has to be invalidated on every write.
    const { data: rows } = await admin
      .from('mixtape_group_shares')
      .select(`
        mixtape:mixtapes!inner (
          id, profile_id, updated_at,
          profile:profiles!inner ( handle, display_name ),
          songs:songs (
            id, title, artist, album, isrc, songlink_url, links_by_platform,
            memory_year, added_at,
            stories ( text )
          )
        )
      `)
      .eq('group_id', group.id);

    type SongRow = {
      id: string;
      title: string;
      artist: string | null;
      album: string | null;
      isrc: string | null;
      songlink_url: string | null;
      links_by_platform: PlatformLinks | null;
      memory_year: number | null;
      added_at: string;
      stories: { text: string }[] | { text: string } | null;
    };
    type ShareRow = {
      mixtape: {
        profile_id: string;
        updated_at: string;
        profile: { handle: string; display_name: string };
        songs: SongRow[];
      };
    };

    const shareRows = (rows as unknown as ShareRow[]) ?? [];

    // Member-mixtape directory (Member-mixtapes tab) — empty mixtapes
    // are filtered out except the viewer's own, which shows even when
    // empty with an "Add a song to make this visible" hint.
    mixtapes = shareRows
      .map((r) => ({
        handle: r.mixtape.profile.handle,
        displayName: r.mixtape.profile.display_name,
        songCount: r.mixtape.songs.length,
        updatedAt: r.mixtape.updated_at,
        isViewer: r.mixtape.profile_id === user?.id
      }))
      .filter((m) => m.songCount > 0 || m.isViewer)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // Song-level aggregation (Songs-we-share + All-songs tabs).
    const byKey = new Map<string, AggregatedSong>();
    for (const share of shareRows) {
      const { handle, display_name: displayName } = share.mixtape.profile;
      for (const song of share.mixtape.songs) {
        const storyRel = Array.isArray(song.stories) ? song.stories[0] : song.stories;
        const storyText = storyRel?.text ?? '';
        const trunc = truncateStory(storyText);

        const contributor: SongContributor = {
          handle,
          displayName,
          memoryYear: song.memory_year,
          storyExcerptHtml: renderStory(trunc.excerpt),
          // Full HTML is only needed if there's a [more] toggle — saves
          // bytes on stories that fit under the truncation cap.
          storyFullHtml: trunc.isTruncated ? renderStory(storyText) : '',
          storyIsTruncated: trunc.isTruncated,
          addedAt: song.added_at
        };

        const key = normalizeSongKey(song.title, song.artist, song.isrc);
        const existing = byKey.get(key);
        if (existing) {
          existing.contributors.push(contributor);
          if (contributor.addedAt > existing.newestAddedAt) {
            existing.newestAddedAt = contributor.addedAt;
          }
          if (!existing.songlinkUrl && song.songlink_url) existing.songlinkUrl = song.songlink_url;
          if (!existing.linksByPlatform && song.links_by_platform) {
            existing.linksByPlatform = song.links_by_platform;
          }
          if (!existing.album && song.album) existing.album = song.album;
        } else {
          byKey.set(key, {
            dedupKey: key,
            title: song.title,
            artist: song.artist,
            album: song.album,
            songlinkUrl: song.songlink_url,
            linksByPlatform: song.links_by_platform,
            contributors: [contributor],
            newestAddedAt: contributor.addedAt
          });
        }
      }
    }

    // Stories under one song: earliest first (preserves thread feel).
    // Songs across the list: newest added first (max contributor.addedAt).
    for (const s of byKey.values()) {
      s.contributors.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    }
    aggregatedSongs = Array.from(byKey.values()).sort((a, b) =>
      b.newestAddedAt.localeCompare(a.newestAddedAt)
    );
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
    songs: aggregatedSongs,
    viewerPref,
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
  shareWith: async ({ params, locals }) => {
    const ctx = await requireGroupRole(params, locals, 'member');
    if (!ctx.ok) return fail(ctx.status, { error: ctx.message });
    const { user, admin, group } = ctx;

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
  unshareFrom: async ({ params, locals }) => {
    const { user, admin, group } = await requireGroupAccess(params, locals);

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
  createInvite: async ({ params, request, locals }) => {
    const ctx = await requireGroupRole(params, locals, 'steward');
    if (!ctx.ok) return fail(ctx.status, { invite: { error: ctx.message } });
    const { user, admin, group } = ctx;

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
  revokeInvite: async ({ params, request, locals }) => {
    const ctx = await requireGroupRole(params, locals, 'steward');
    if (!ctx.ok) return fail(ctx.status, { invite: { error: ctx.message } });
    const { admin, group } = ctx;

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
  editDescription: async ({ params, request, locals }) => {
    const ctx = await requireGroupRole(params, locals, 'steward');
    if (!ctx.ok) return fail(ctx.status, { description: { error: ctx.message } });
    const { admin, group } = ctx;

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
  editName: async ({ params, request, locals }) => {
    const ctx = await requireGroupRole(params, locals, 'steward');
    if (!ctx.ok) return fail(ctx.status, { name: { error: ctx.message } });
    const { admin, group } = ctx;

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

import { error, fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { renderStory } from '$lib/server/markdown';
import { adminClient } from '$lib/server/supabase-admin';
import { requireMixtapeOwner } from '$lib/server/mixtape-actions';
import { LISTEN_PREF_COOKIE, isListenPref, type ListenPref } from '$lib/listen';
import type { DisplaySong, PlatformLinks, ProfileRow, SongRow } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const VISITOR_COOKIE = 'mxs_visitor';
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type SongWithStory = SongRow & {
  links_by_platform: PlatformLinks | null;
  stories: { text: string } | { text: string }[] | null;
};

export const load: PageServerLoad = async ({
  params,
  cookies,
  locals: { supabase, safeGetSession }
}) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .eq('handle', params.handle)
    .maybeSingle<Pick<ProfileRow, 'id' | 'handle' | 'display_name'>>();

  if (!profile) throw error(404, 'Mixtape not found');

  // /{handle} shows the user's mixtape. Under share semantics each user
  // has exactly one mixtape entity; it can be shared with N groups via
  // the mixtape_group_shares table, but there's only one row's worth of
  // songs and stories. Scoping song reads to the mixtape's id ensures
  // we only see this user's content (defense in depth even though
  // owner_id alone would work today).
  const { data: personalMixtape } = await supabase
    .from('mixtapes')
    .select('id, name, description')
    .eq('profile_id', profile.id)
    .maybeSingle<{ id: string; name: string | null; description: string }>();

  // No mixtape (very old profile not yet backfilled) → page renders
  // empty rather than 404; the profile still exists.
  let songs: DisplaySong[] = [];
  if (personalMixtape) {
    const { data: rows, error: songsErr } = await supabase
      .from('songs')
      .select(
        'id, position, title, artist, album, release_year, memory_year, album_art_url, songlink_url, links_by_platform, preview_url, link_status, stories(text)'
      )
      .eq('mixtape_id', personalMixtape.id)
      .order('position');

    if (songsErr) throw error(500, songsErr.message);

    songs = (rows ?? []).map((row) => {
      const r = row as unknown as SongWithStory;
      const storyRel = Array.isArray(r.stories) ? r.stories[0] : r.stories;
      const storyText = storyRel?.text ?? '';
      return {
        id: r.id,
        position: r.position,
        title: r.title,
        artist: r.artist,
        album: r.album,
        releaseYear: r.release_year,
        memoryYear: r.memory_year,
        albumArtUrl: r.album_art_url,
        songlinkUrl: r.songlink_url,
        linksByPlatform: r.links_by_platform,
        previewUrl: r.preview_url,
        linkStatus: r.link_status,
        storyText,
        storyHtml: renderStory(storyText)
      };
    });
  }

  const rawPref = cookies.get(LISTEN_PREF_COOKIE);
  const viewerPref: ListenPref | null = isListenPref(rawPref) ? rawPref : null;

  // Visit tracking. The owner's own visits don't count. Authenticated
  // non-owners dedupe by user.id; anon visitors get a long-lived
  // httpOnly cookie that dedupes them per mixtape.
  const { user } = await safeGetSession();
  const isOwner = user?.id === profile.id;

  if (!isOwner) {
    let visitorId: string;
    if (user) {
      visitorId = `user:${user.id}`;
    } else {
      let token = cookies.get(VISITOR_COOKIE);
      if (!token) {
        token = crypto.randomUUID();
        cookies.set(VISITOR_COOKIE, token, {
          path: '/',
          maxAge: VISITOR_COOKIE_MAX_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: !dev
        });
      }
      visitorId = `anon:${token}`;
    }

    // RLS denies anon/authenticated writes — go through service-role.
    await adminClient()
      .from('mixtape_visits')
      .upsert(
        {
          profile_id: profile.id,
          visitor_id: visitorId,
          last_visit_at: new Date().toISOString()
        },
        { onConflict: 'profile_id,visitor_id' }
      );
  }

  let visitorCount: number | null = null;
  if (isOwner) {
    const { count } = await supabase
      .from('mixtape_visits')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', profile.id);
    visitorCount = count ?? 0;
  }

  return {
    handle: profile.handle,
    displayName: profile.display_name,
    mixtapeName: personalMixtape?.name ?? null,
    mixtapeDescription: personalMixtape?.description ?? '',
    songs,
    visitorCount,
    viewerPref
  };
};

// Inline-edit actions for the masthead. Same shape as the group
// landing's editName / editDescription — discriminated form payload
// (`{ name: { … } }`, `{ description: { … } }`) so the page's $derived
// narrowing keeps working without surprises.
//
// Length caps mirror the group: 100 chars for name, 500 for description.
// Empty name is allowed and means "reset to the displayName fallback"
// (the DB column is nullable; we write null when the input is empty).
export const actions: Actions = {
  editName: async ({ params, request, locals }) => {
    const ctx = await requireMixtapeOwner(params, locals);
    if (!ctx.ok) return fail(ctx.status, { name: { error: ctx.message } });
    const { admin, mixtape } = ctx;

    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (name.length > 100) {
      return fail(400, {
        name: { value: name, error: 'Name must be 100 characters or fewer.' }
      });
    }

    // Empty input → set to null so the read path falls back to the
    // derived "{display_name}'s mixtape" title. Useful if the creator
    // wants to revert after trying a custom name.
    const valueToWrite = name.length === 0 ? null : name;

    const { error: updateError } = await admin
      .from('mixtapes')
      .update({ name: valueToWrite })
      .eq('id', mixtape.id);
    if (updateError) {
      return fail(500, { name: { value: name, error: 'Could not save. Try again.' } });
    }

    return { name: { ok: true } };
  },

  editDescription: async ({ params, request, locals }) => {
    const ctx = await requireMixtapeOwner(params, locals);
    if (!ctx.ok) return fail(ctx.status, { description: { error: ctx.message } });
    const { admin, mixtape } = ctx;

    const data = await request.formData();
    const description = String(data.get('description') ?? '').trim();
    if (description.length > 500) {
      return fail(400, {
        description: { value: description, error: 'Description must be 500 characters or fewer.' }
      });
    }

    const { error: updateError } = await admin
      .from('mixtapes')
      .update({ description })
      .eq('id', mixtape.id);
    if (updateError) {
      return fail(500, { description: { value: description, error: 'Could not save. Try again.' } });
    }

    return { description: { ok: true } };
  }
};

import { error, fail, redirect } from '@sveltejs/kit';
import type { ProfileRow, SongRow } from '$lib/types';
import { resolveSong, MusicServiceError, normalizeSourceUrl } from '$lib/server/music';
import { parseSongList, resolveBatch } from '$lib/server/music/parse-list';
import { searchCached } from '$lib/server/music/itunes-cache';
import type { CachedSongPayload, Track } from '$lib/server/music/types';
import { triggerOgRender } from '$lib/server/og-render';
import { requireMixtapeOwner } from '$lib/server/mixtape-actions';
import type { Actions, PageServerLoad } from './$types';

type SongWithStory = SongRow & { stories: { text: string } | { text: string }[] | null };

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  // Shared owner/slug resolution — edits propagate to every group a
  // mixtape is shared with because there's only one row per mixtape.
  const own = await requireMixtapeOwner(params, { safeGetSession });
  if (!own.ok) throw error(own.status, own.message);

  const { data: rows, error: songsErr } = await supabase
    .from('songs')
    .select(
      'id, owner_id, position, title, artist, album, release_year, memory_year, isrc, album_art_url, source_url, songlink_url, link_status, link_attempts, link_last_attempt, link_last_error, added_at, stories(text)'
    )
    .eq('mixtape_id', own.mixtape.id)
    .order('position');

  if (songsErr) throw error(500, songsErr.message);

  const songs = (rows ?? []).map((row) => {
    const r = row as unknown as SongWithStory;
    const storyRel = Array.isArray(r.stories) ? r.stories[0] : r.stories;
    return { ...r, story_text: storyRel?.text ?? '' };
  });

  return {
    handle: own.profile.handle,
    displayName: own.profile.display_name,
    mixtapeSlug: own.mixtape.slug,
    mixtapeName: own.mixtape.name,
    songs
  };
};

// Thin fail()-shaped adapter over the shared resolver — the editor's
// actions return fail payloads where the reader's inline-edit actions
// build their own. One resolver, two wrappers.
async function getOwnerOrFail(
  params: { handle: string; slug?: string },
  locals: Pick<App.Locals, 'safeGetSession'>
): Promise<{ ownerId: string; mixtapeId: string } | { fail: ReturnType<typeof fail> }> {
  const own = await requireMixtapeOwner(params, locals);
  if (!own.ok) return { fail: fail(own.status, { error: own.message }) };
  return { ownerId: own.profile.id, mixtapeId: own.mixtape.id };
}

async function nextPosition(
  supabase: App.Locals['supabase'],
  mixtapeId: string
): Promise<number> {
  const { data } = await supabase
    .from('songs')
    .select('position')
    .eq('mixtape_id', mixtapeId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.position as number | undefined) ?? 0) + 1;
}


// The one song-insertion flow. All four add paths (manual entry,
// search pick, URL resolve, bulk import) converge here: position
// assignment, cache lookup, insert, the empty-story placeholder, and
// the primary-only OG re-render. A track without a normalized source
// URL is a manual entry; a cache hit lands as 'done', a miss as
// 'pending' for the resolve-queue worker.
type InsertableTrack = {
  title: string;
  artist?: string | null;
  album?: string | null;
  releaseYear?: number | null;
  isrc?: string | null;
  albumArtUrl?: string | null;
  previewUrl?: string | null;
  normalizedSourceUrl?: string | null;
};

async function insertSongs(
  supabase: App.Locals['supabase'],
  own: { ownerId: string; mixtapeId: string },
  tracks: InsertableTrack[],
  ogContext: {
    slug?: string | undefined;
    handle: string;
    fetch: typeof globalThis.fetch;
    platform: App.Platform | undefined;
  }
): Promise<{ imported: number } | { fail: ReturnType<typeof fail> }> {
  const startPos = await nextPosition(supabase, own.mixtapeId);

  const sources = tracks.map((t) => t.normalizedSourceUrl).filter((s): s is string => !!s);
  const cacheMap = new Map<string, CachedSongPayload>();
  if (sources.length > 0) {
    const { data: cached } = await supabase
      .from('song_cache')
      .select('source_url, payload')
      .in('source_url', sources);
    for (const row of cached ?? []) {
      const r = row as { source_url: string; payload: CachedSongPayload };
      cacheMap.set(r.source_url, r.payload);
    }
  }

  const inserts = tracks.map((t, i) => {
    const normalized = t.normalizedSourceUrl || null;
    const hit = normalized ? cacheMap.get(normalized) : null;
    return {
      owner_id: own.ownerId,
      mixtape_id: own.mixtapeId,
      position: startPos + i,
      title: t.title,
      artist: t.artist ?? null,
      album: t.album ?? null,
      release_year: t.releaseYear ?? null,
      isrc: t.isrc ?? null,
      album_art_url: t.albumArtUrl ?? null,
      preview_url: t.previewUrl ?? null,
      source_url: normalized,
      songlink_url: hit?.songlinkUrl ?? null,
      links_by_platform: hit?.linksByPlatform ?? null,
      link_status: !normalized ? 'manual' : hit?.songlinkUrl ? 'done' : 'pending'
    };
  });

  const { data: created, error: insertErr } = await supabase
    .from('songs')
    .insert(inserts)
    .select('id');
  if (insertErr || !created) {
    return { fail: fail(500, { error: insertErr?.message ?? 'Could not add song' }) };
  }

  // Placeholder story rows — the editor's Story button keys off them
  // existing. The reader falls back gracefully if one is missing, but
  // a failed insert here is still worth surfacing.
  const { error: storyErr } = await supabase
    .from('stories')
    .insert(created.map((r) => ({ song_id: (r as { id: string }).id, text: '' })));
  if (storyErr) return { fail: fail(500, { error: storyErr.message }) };

  if (!ogContext.slug) {
    triggerOgRender(ogContext.handle, { fetch: ogContext.fetch, platform: ogContext.platform });
  }
  return { imported: created.length };
}

export const actions: Actions = {
  // Add a single song manually (no URL resolution).
  manual: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });

    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const artist = String(data.get('artist') ?? '').trim() || null;
    const album = String(data.get('album') ?? '').trim() || null;

    if (!title) return fail(400, { error: 'A title is required.' });

    const result = await insertSongs(supabase, own, [{ title, artist, album }], {
      slug: params.slug,
      handle: params.handle,
      fetch,
      platform
    });
    if ('fail' in result) return result.fail;
    return { ok: true };
  },

  // Add one song from a picked Track payload (Search tab). Skips URL resolution
  // since we already have canonical metadata. Inserts as link_status='pending';
  // the Odesli worker fills in the universal songlink_url asynchronously.
  add_track: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const raw = String(data.get('track') ?? '');
    if (!raw) return fail(400, { error: 'Missing track' });

    let track: Track;
    try {
      track = JSON.parse(raw) as Track;
    } catch {
      return fail(400, { error: 'Bad track payload' });
    }
    if (!track.title || !track.sourceUrl) {
      return fail(400, { error: 'Track is missing title or source URL' });
    }

    const result = await insertSongs(
      supabase,
      own,
      [{ ...track, normalizedSourceUrl: normalizeSourceUrl(track.sourceUrl) }],
      { slug: params.slug, handle: params.handle, fetch, platform }
    );
    if ('fail' in result) return result.fail;
    return { ok: true };
  },

  // Resolve a pasted single-song URL (Apple Music, Spotify, YouTube Music, etc).
  // Always inserts one row. Playlist URLs are not supported here — use the
  // text-list paste flow (`parse_list` action) for bulk adds.
  resolve: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });

    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const url = String(data.get('url') ?? '').trim();
    if (!url) return fail(400, { error: 'Paste a song URL first.' });

    let track: Track;
    try {
      track = await resolveSong(url);
    } catch (err) {
      const message = err instanceof MusicServiceError ? err.message : 'Could not read that URL.';
      return fail(400, { error: message, url });
    }

    const result = await insertSongs(
      supabase,
      own,
      [{ ...track, normalizedSourceUrl: normalizeSourceUrl(track.sourceUrl) }],
      { slug: params.slug, handle: params.handle, fetch, platform }
    );
    if ('fail' in result) return result.fail;
    return { ok: true };
  },

  // Commit the preview rows the user picked from a playlist or list resolution.
  // Each row with a non-empty normalizedSourceUrl goes in as 'pending' (or 'done'
  // on a cache hit); rows with an empty source URL go in as manual entries.
  import_playlist: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });

    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const payload = String(data.get('payload') ?? '');
    if (!payload) return fail(400, { error: 'Nothing to import.' });

    type PreviewTrack = {
      title: string;
      artist: string | null;
      album: string | null;
      releaseYear: number | null;
      albumArtUrl: string | null;
      previewUrl: string | null;
      sourceUrl: string;
      normalizedSourceUrl: string;
    };
    let tracks: PreviewTrack[];
    try {
      tracks = JSON.parse(payload) as PreviewTrack[];
    } catch {
      return fail(400, { error: 'Bad import payload.' });
    }
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return fail(400, { error: 'No songs selected.' });
    }

    const result = await insertSongs(supabase, own, tracks, {
      slug: params.slug,
      handle: params.handle,
      fetch,
      platform
    });
    if ('fail' in result) return result.fail;
    return { ok: true, imported: result.imported };
  },

  // Free-text list paste: parse, search iTunes per entry, return a preview.
  parse_list: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const text = String(data.get('text') ?? '');
    if (!text.trim()) return fail(400, { error: 'Paste a list of songs first.' });

    const entries = parseSongList(text);
    if (entries.length === 0) return fail(400, { error: "Couldn't find any songs in that text." });
    if (entries.length > 100) return fail(400, { error: 'Too many songs (100 max per paste).' });

    // Cache-aware lookup: check shared itunes_cache before hitting the API,
    // then write back the top-8 on a fresh hit so a later "try a different
    // match" click is free. Concurrency 3 keeps us under the public endpoint's
    // ~20/min ceiling even when the same user pastes 50+ unique lines.
    const pickTop = async (query: string): Promise<Track | null> => {
      const tracks = await searchCached(supabase, query);
      return tracks[0] ?? null;
    };
    const results = await resolveBatch<Track>(entries, pickTop, 3);

    const existing = await supabase
      .from('songs')
      .select('source_url')
      .eq('mixtape_id', own.mixtapeId);
    const existingUrls = new Set(
      (existing.data ?? [])
        .map((r) => (r as { source_url: string | null }).source_url)
        .filter((u): u is string => !!u)
    );

    return {
      preview: {
        service: 'itunes',
        sourceUrl: '',
        tracks: results.map((r) => {
          if (!r.result) {
            return {
              query: r.entry.query,
              raw: r.entry.raw,
              note: r.entry.note,
              title: r.entry.title ?? '(no match)',
              artist: r.entry.artist,
              album: null,
              releaseYear: null,
              albumArtUrl: null,
              previewUrl: null,
              sourceUrl: '',
              normalizedSourceUrl: '',
              duplicate: false,
              error: r.error ?? 'No match found',
              unmatched: true
            };
          }
          const t = r.result;
          const normalized = normalizeSourceUrl(t.sourceUrl);
          return {
            query: r.entry.query,
            raw: r.entry.raw,
            note: r.entry.note,
            title: t.title,
            artist: t.artist,
            album: t.album,
            releaseYear: t.releaseYear,
            albumArtUrl: t.albumArtUrl,
            previewUrl: t.previewUrl,
            sourceUrl: t.sourceUrl,
            normalizedSourceUrl: normalized,
            duplicate: existingUrls.has(normalized),
            error: null,
            unmatched: false
          };
        })
      }
    };
  },

  // Per-row "try a different match" picker. Returns top-N candidates for a query.
  search_alternates: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const data = await request.formData();
    const query = String(data.get('query') ?? '').trim();
    if (!query) return fail(400, { error: 'Missing query' });
    let results: Track[];
    try {
      results = await searchCached(supabase, query);
    } catch (err) {
      return fail(500, { error: (err as Error).message });
    }
    return {
      alternates: {
        query,
        tracks: results.map((t) => ({
          title: t.title,
          artist: t.artist,
          album: t.album,
          releaseYear: t.releaseYear,
          albumArtUrl: t.albumArtUrl,
          previewUrl: t.previewUrl,
          sourceUrl: t.sourceUrl,
          normalizedSourceUrl: normalizeSourceUrl(t.sourceUrl)
        }))
      }
    };
  },

  save_story: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const songId = String(data.get('song_id') ?? '');
    const text = String(data.get('text') ?? '');
    if (!songId) return fail(400, { error: 'Missing song_id' });
    // Mirror the DB CHECK constraint (migration 0010). Bouncing here gives
    // a clean error message instead of a generic Postgres failure.
    if (text.length > 10_000) {
      return fail(400, {
        error: `Story is ${text.length.toLocaleString()} characters. Max is 10,000.`
      });
    }

    // memory_year lives on `songs` but is set alongside the story — it's
    // a story-shaped piece of data ("what year does this song remind you
    // of") and users were skipping it when it lived on the metadata form.
    const memoryYearRaw = String(data.get('memory_year') ?? '').trim();
    const memoryYear = memoryYearRaw ? Number.parseInt(memoryYearRaw, 10) : null;

    const { error: songErr } = await supabase
      .from('songs')
      .update({ memory_year: Number.isFinite(memoryYear) ? memoryYear : null })
      .eq('id', songId)
      .eq('mixtape_id', own.mixtapeId);
    if (songErr) return fail(500, { error: songErr.message });

    const { error: upsertErr } = await supabase
      .from('stories')
      .upsert({ song_id: songId, text }, { onConflict: 'song_id' });
    if (upsertErr) return fail(500, { error: upsertErr.message });
    return { ok: true };
  },

  save_meta: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const songId = String(data.get('song_id') ?? '');
    if (!songId) return fail(400, { error: 'Missing song_id' });

    const patch: Record<string, unknown> = {
      title: String(data.get('title') ?? '').trim(),
      artist: String(data.get('artist') ?? '').trim() || null,
      album: String(data.get('album') ?? '').trim() || null
    };

    if (!patch.title) return fail(400, { error: 'Title is required' });

    const { error: updErr } = await supabase
      .from('songs')
      .update(patch)
      .eq('id', songId)
      .eq('mixtape_id', own.mixtapeId);
    if (updErr) return fail(500, { error: updErr.message });
    if (!params.slug) triggerOgRender(params.handle, { fetch, platform });
    return { ok: true };
  },

  // Persist a new song order from the drag-and-drop UI. Takes the full ordered
  // ID array and rewrites positions 1..N. Safe to run concurrently because each
  // owner only ever has one tab actively editing.
  reorder: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const raw = String(data.get('ids') ?? '');
    let ids: string[];
    try {
      ids = JSON.parse(raw) as string[];
    } catch {
      return fail(400, { error: 'Bad ids payload' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return fail(400, { error: 'No ids to reorder' });
    }

    // Two-pass to avoid transient unique-position duplicates (no constraint
    // exists, but easier to reason about): bump everything negative, then
    // assign final positions.
    await supabase
      .from('songs')
      .update({ position: -1 })
      .eq('mixtape_id', own.mixtapeId);
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('songs')
        .update({ position: i + 1 })
        .eq('id', ids[i])
        .eq('mixtape_id', own.mixtapeId);
    }
    if (!params.slug) triggerOgRender(params.handle, { fetch, platform });
    return { ok: true };
  },

  delete: async ({ request, params, fetch, platform, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(params, { safeGetSession });
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const songId = String(data.get('song_id') ?? '');
    if (!songId) return fail(400, { error: 'Missing song_id' });

    const { error: delErr } = await supabase
      .from('songs')
      .delete()
      .eq('id', songId)
      .eq('mixtape_id', own.mixtapeId);
    if (delErr) return fail(500, { error: delErr.message });
    if (!params.slug) triggerOgRender(params.handle, { fetch, platform });
    return { ok: true };
  }
};

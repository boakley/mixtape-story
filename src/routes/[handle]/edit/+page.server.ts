import { error, fail, redirect } from '@sveltejs/kit';
import type { ProfileRow, SongRow } from '$lib/types';
import { resolveSong, MusicServiceError, normalizeSourceUrl } from '$lib/server/music';
import { parseSongList, resolveBatch } from '$lib/server/music/parse-list';
import { searchCached } from '$lib/server/music/itunes-cache';
import type { Track } from '$lib/server/music/types';
import type { Actions, PageServerLoad } from './$types';

type SongWithStory = SongRow & { stories: { text: string } | { text: string }[] | null };

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .eq('handle', params.handle)
    .maybeSingle<Pick<ProfileRow, 'id' | 'handle' | 'display_name'>>();

  if (!profile) throw error(404, 'Mixtape not found');
  if (profile.id !== user.id) throw error(403, 'This is not your mixtape');

  const { data: rows, error: songsErr } = await supabase
    .from('songs')
    .select(
      'id, owner_id, position, title, artist, album, release_year, memory_year, isrc, album_art_url, source_url, songlink_url, link_status, link_attempts, link_last_attempt, link_last_error, added_at, stories(text)'
    )
    .eq('owner_id', profile.id)
    .order('position');

  if (songsErr) throw error(500, songsErr.message);

  const songs = (rows ?? []).map((row) => {
    const r = row as unknown as SongWithStory;
    const storyRel = Array.isArray(r.stories) ? r.stories[0] : r.stories;
    return { ...r, story_text: storyRel?.text ?? '' };
  });

  return {
    handle: profile.handle,
    displayName: profile.display_name,
    songs
  };
};

async function getOwnerOrFail(
  supabase: App.Locals['supabase'],
  handle: string,
  userId: string
): Promise<{ ownerId: string } | { fail: ReturnType<typeof fail> }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();
  if (!profile) return { fail: fail(404, { error: 'Mixtape not found' }) };
  if (profile.id !== userId) return { fail: fail(403, { error: 'Not your mixtape' }) };
  return { ownerId: profile.id };
}

async function nextPosition(
  supabase: App.Locals['supabase'],
  ownerId: string
): Promise<number> {
  const { data } = await supabase
    .from('songs')
    .select('position')
    .eq('owner_id', ownerId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.position as number | undefined) ?? 0) + 1;
}

export const actions: Actions = {
  // Add a single song manually (no URL resolution).
  manual: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });

    const own = await getOwnerOrFail(supabase, params.handle, user.id);
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const artist = String(data.get('artist') ?? '').trim() || null;
    const album = String(data.get('album') ?? '').trim() || null;
    const memoryYearRaw = String(data.get('memory_year') ?? '').trim();
    const memoryYear = memoryYearRaw ? Number.parseInt(memoryYearRaw, 10) : null;

    if (!title) return fail(400, { error: 'A title is required.' });

    const position = await nextPosition(supabase, own.ownerId);
    const { data: song, error: insertErr } = await supabase
      .from('songs')
      .insert({
        owner_id: own.ownerId,
        position,
        title,
        artist,
        album,
        memory_year: Number.isFinite(memoryYear) ? memoryYear : null,
        link_status: 'manual'
      })
      .select('id')
      .single();

    if (insertErr || !song) return fail(500, { error: insertErr?.message ?? 'Could not add song' });

    await supabase.from('stories').insert({ song_id: song.id, text: '' });
    return { ok: true };
  },

  // Add one song from a picked Track payload (Search tab). Skips URL resolution
  // since we already have canonical metadata. Inserts as link_status='pending';
  // the Odesli worker fills in the universal songlink_url asynchronously.
  add_track: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(supabase, params.handle, user.id);
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

    const position = await nextPosition(supabase, own.ownerId);
    const normalized = normalizeSourceUrl(track.sourceUrl);

    const { data: cached } = await supabase
      .from('song_cache')
      .select('payload')
      .eq('source_url', normalized)
      .maybeSingle();
    const cachedPayload = (cached?.payload ?? null) as { songlinkUrl?: string } | null;

    const { data: song, error: insertErr } = await supabase
      .from('songs')
      .insert({
        owner_id: own.ownerId,
        position,
        title: track.title,
        artist: track.artist,
        album: track.album,
        release_year: track.releaseYear,
        isrc: track.isrc,
        album_art_url: track.albumArtUrl,
        preview_url: track.previewUrl,
        source_url: normalized,
        songlink_url: cachedPayload?.songlinkUrl ?? null,
        link_status: cachedPayload?.songlinkUrl ? 'done' : 'pending'
      })
      .select('id')
      .single();
    if (insertErr || !song) return fail(500, { error: insertErr?.message ?? 'Insert failed' });
    await supabase.from('stories').insert({ song_id: song.id, text: '' });
    return { ok: true };
  },

  // Resolve a pasted single-song URL (Apple Music, Spotify, YouTube Music, etc).
  // Always inserts one row. Playlist URLs are not supported here — use the
  // text-list paste flow (`parse_list` action) for bulk adds.
  resolve: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });

    const own = await getOwnerOrFail(supabase, params.handle, user.id);
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

    const position = await nextPosition(supabase, own.ownerId);
    const normalized = normalizeSourceUrl(track.sourceUrl);

    const { data: cached } = await supabase
      .from('song_cache')
      .select('payload')
      .eq('source_url', normalized)
      .maybeSingle();

    const cachedPayload = (cached?.payload ?? null) as { songlinkUrl?: string } | null;

    const { data: song, error: insertErr } = await supabase
      .from('songs')
      .insert({
        owner_id: own.ownerId,
        position,
        title: track.title,
        artist: track.artist,
        album: track.album,
        release_year: track.releaseYear,
        isrc: track.isrc,
        album_art_url: track.albumArtUrl,
        preview_url: track.previewUrl,
        source_url: normalized,
        songlink_url: cachedPayload?.songlinkUrl ?? null,
        link_status: cachedPayload?.songlinkUrl ? 'done' : 'pending'
      })
      .select('id')
      .single();

    if (insertErr || !song) return fail(500, { error: insertErr?.message ?? 'Could not add song' });
    await supabase.from('stories').insert({ song_id: song.id, text: '' });
    return { ok: true };
  },

  // Commit the preview rows the user picked from a playlist or list resolution.
  // Each row with a non-empty normalizedSourceUrl goes in as 'pending' (or 'done'
  // on a cache hit); rows with an empty source URL go in as manual entries.
  import_playlist: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });

    const own = await getOwnerOrFail(supabase, params.handle, user.id);
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

    const startPos = await nextPosition(supabase, own.ownerId);

    // Cache hits become 'done' immediately; misses go to 'pending'; entries
    // without a source URL at all become 'manual'.
    const sources = tracks.map((t) => t.normalizedSourceUrl).filter((s) => !!s);
    const cacheMap = new Map<string, { songlinkUrl?: string }>();
    if (sources.length > 0) {
      const { data: cached } = await supabase
        .from('song_cache')
        .select('source_url, payload')
        .in('source_url', sources);
      for (const row of cached ?? []) {
        const r = row as { source_url: string; payload: { songlinkUrl?: string } };
        cacheMap.set(r.source_url, r.payload);
      }
    }

    const inserts = tracks.map((t, i) => {
      const normalized = t.normalizedSourceUrl || null;
      const hit = normalized ? cacheMap.get(normalized) : null;
      const linkStatus = !normalized ? 'manual' : hit?.songlinkUrl ? 'done' : 'pending';
      return {
        owner_id: own.ownerId,
        position: startPos + i,
        title: t.title,
        artist: t.artist,
        album: t.album,
        release_year: t.releaseYear,
        album_art_url: t.albumArtUrl,
        preview_url: t.previewUrl,
        source_url: normalized,
        songlink_url: hit?.songlinkUrl ?? null,
        link_status: linkStatus
      };
    });

    const { data: created, error: insertErr } = await supabase
      .from('songs')
      .insert(inserts)
      .select('id');

    if (insertErr || !created) return fail(500, { error: insertErr?.message ?? 'Insert failed' });

    if (created.length > 0) {
      await supabase
        .from('stories')
        .insert(created.map((r) => ({ song_id: (r as { id: string }).id, text: '' })));
    }

    return { ok: true, imported: created.length };
  },

  // Free-text list paste: parse, search iTunes per entry, return a preview.
  parse_list: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(supabase, params.handle, user.id);
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
      .eq('owner_id', own.ownerId);
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
    const own = await getOwnerOrFail(supabase, params.handle, user.id);
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const songId = String(data.get('song_id') ?? '');
    const text = String(data.get('text') ?? '');
    if (!songId) return fail(400, { error: 'Missing song_id' });

    const { error: upsertErr } = await supabase
      .from('stories')
      .upsert({ song_id: songId, text }, { onConflict: 'song_id' });
    if (upsertErr) return fail(500, { error: upsertErr.message });
    return { ok: true };
  },

  save_meta: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(supabase, params.handle, user.id);
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const songId = String(data.get('song_id') ?? '');
    if (!songId) return fail(400, { error: 'Missing song_id' });

    const memoryYearRaw = String(data.get('memory_year') ?? '').trim();
    const memoryYear = memoryYearRaw ? Number.parseInt(memoryYearRaw, 10) : null;

    const patch: Record<string, unknown> = {
      title: String(data.get('title') ?? '').trim(),
      artist: String(data.get('artist') ?? '').trim() || null,
      album: String(data.get('album') ?? '').trim() || null,
      memory_year: Number.isFinite(memoryYear) ? memoryYear : null
    };

    if (!patch.title) return fail(400, { error: 'Title is required' });

    const { error: updErr } = await supabase
      .from('songs')
      .update(patch)
      .eq('id', songId)
      .eq('owner_id', own.ownerId);
    if (updErr) return fail(500, { error: updErr.message });
    return { ok: true };
  },

  // Persist a new song order from the drag-and-drop UI. Takes the full ordered
  // ID array and rewrites positions 1..N. Safe to run concurrently because each
  // owner only ever has one tab actively editing.
  reorder: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(supabase, params.handle, user.id);
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
      .eq('owner_id', own.ownerId);
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('songs')
        .update({ position: i + 1 })
        .eq('id', ids[i])
        .eq('owner_id', own.ownerId);
    }
    return { ok: true };
  },

  delete: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'Sign in required' });
    const own = await getOwnerOrFail(supabase, params.handle, user.id);
    if ('fail' in own) return own.fail;

    const data = await request.formData();
    const songId = String(data.get('song_id') ?? '');
    if (!songId) return fail(400, { error: 'Missing song_id' });

    const { error: delErr } = await supabase
      .from('songs')
      .delete()
      .eq('id', songId)
      .eq('owner_id', own.ownerId);
    if (delErr) return fail(500, { error: delErr.message });
    return { ok: true };
  }
};

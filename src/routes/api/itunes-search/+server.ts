import { error, json } from '@sveltejs/kit';
import { searchCached } from '$lib/server/music/itunes-cache';
import { normalizeSourceUrl } from '$lib/server/music';
import type { RequestHandler } from './$types';

/**
 * Live-search endpoint for the editor's "Search" tab. Returns up to 8 candidates
 * for a typed query. Hits the shared `itunes_cache` first; misses go to the
 * public iTunes Search API and write back. Signed-in users only — no point
 * letting anonymous traffic burn through the 20/min ceiling.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Sign in required');

  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json({ results: [] });

  let tracks;
  try {
    tracks = await searchCached(supabase, q);
  } catch (err) {
    throw error(503, (err as Error).message);
  }

  return json({
    results: tracks.slice(0, 8).map((t) => ({
      title: t.title,
      artist: t.artist,
      album: t.album,
      releaseYear: t.releaseYear,
      isrc: t.isrc,
      albumArtUrl: t.albumArtUrl,
      previewUrl: t.previewUrl,
      sourceUrl: t.sourceUrl,
      normalizedSourceUrl: normalizeSourceUrl(t.sourceUrl)
    }))
  });
};

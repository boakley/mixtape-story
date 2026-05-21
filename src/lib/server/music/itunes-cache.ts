import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '$lib/server/supabase-admin';
import { searchTracks } from './apple-music';
import type { Track } from './types';

// The file and table are still named "itunes_cache" for historical reasons —
// the search backend underneath was swapped from iTunes Search to Apple Music
// API in Phase 2 (see docs/PHASE-2-resolver-and-pref.md). The Track shape is
// identical between the two services, so cache rows from before the swap are
// safe to keep, but old rows came from iTunes and have iTunes-style source
// URLs. Flushing the table after the swap forces fresh Apple Music results
// (better ISRC matches for old catalog through Odesli).

/**
 * Normalize a free-text query so casing and whitespace variations collapse to
 * the same cache key. Doesn't try to be clever about word order or punctuation
 * — those happen at the search-service layer, not the cache layer.
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Shared cache of music-catalog search top-N results. Stores the top 8 per
 * query so that both single-pick lookups (paste-list, picker first hit) and
 * the "try a different match" alternates view are served from one API call.
 */
export async function getCached(
  supabase: SupabaseClient,
  query: string
): Promise<Track[] | null> {
  const key = normalizeQuery(query);
  if (!key) return null;
  const { data } = await supabase
    .from('itunes_cache')
    .select('payload')
    .eq('query', key)
    .maybeSingle();
  if (!data) return null;
  const payload = (data as { payload: { tracks?: Track[] } | Track[] }).payload;
  if (Array.isArray(payload)) return payload;
  return payload.tracks ?? null;
}

async function putCached(query: string, tracks: Track[]): Promise<void> {
  const key = normalizeQuery(query);
  if (!key) return;
  await adminClient()
    .from('itunes_cache')
    .upsert(
      { query: key, payload: { tracks }, fetched_at: new Date().toISOString() },
      { onConflict: 'query' }
    );
}

/**
 * Cache-aware catalog search. Always fetches up to 8 results so subsequent
 * "try a different match" or live-picker calls for the same query are free.
 */
export async function searchCached(
  supabase: SupabaseClient,
  query: string
): Promise<Track[]> {
  const cached = await getCached(supabase, query);
  if (cached) return cached;
  const fresh = await searchTracks(query, 8);
  if (fresh.length > 0) await putCached(query, fresh);
  return fresh;
}

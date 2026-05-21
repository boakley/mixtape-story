// One-shot backfill of songs.links_by_platform for songs that were
// resolved before the column existed (Phase 2 step 4). Runs server-side
// inside Supabase so we don't have to ship the prod service-role key to
// a local machine.
//
// Per song:
//   1. Check song_cache by source_url. If the cached payload already has
//      linksByPlatform, copy from cache — no API call.
//   2. Otherwise, hit Odesli, write linksByPlatform back to the songs row
//      AND refresh the cache payload so future cache reads include it.
//
// Rate-limited at ~9/min to respect Odesli's stated ceiling. Each
// invocation processes up to BATCH_SIZE songs and exits — caller
// re-invokes until "remaining" is 0. The links_by_platform IS NULL filter
// makes the function safely re-runnable.
//
// Invoke:
//   curl -X POST '<base>/functions/v1/backfill-links' \
//        -H "Authorization: Bearer <anon-or-service-key>" \
//        -H 'Content-Type: application/json' \
//        -d '{"batch_size": 8}'

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ODESLI_ENDPOINT = 'https://api.song.link/v1-alpha.1/links';
const DEFAULT_BATCH = 8;
const RATE_LIMIT_MS = 6_500;

type OdesliResp = {
  pageUrl?: string;
  linksByPlatform?: Record<string, { url?: string }>;
};

async function odesli(url: string): Promise<
  | { linksByPlatform: Record<string, { url: string }>; songlinkUrl: string }
  | { rateLimited: true }
  | { error: string }
> {
  const endpoint = `${ODESLI_ENDPOINT}?url=${encodeURIComponent(url)}`;
  let res: Response;
  try {
    res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  } catch (err) {
    return { error: `fetch failed: ${(err as Error).message}` };
  }
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) return { error: `Odesli ${res.status}` };
  const data = (await res.json()) as OdesliResp;
  if (!data.pageUrl) return { error: 'no pageUrl' };

  const links: Record<string, { url: string }> = {};
  for (const [platform, link] of Object.entries(data.linksByPlatform ?? {})) {
    if (link?.url) links[platform] = { url: link.url };
  }
  return { linksByPlatform: links, songlinkUrl: data.pageUrl };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req: Request) => {
  let body: { batch_size?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* no body is fine */
  }
  const batchSize = Math.min(Math.max(body.batch_size ?? DEFAULT_BATCH, 1), 50);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // Count remaining for the response (cheap; same filter as the work query).
  const { count: totalRemaining } = await sb
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('link_status', 'done')
    .is('links_by_platform', null);

  const { data: songs, error } = await sb
    .from('songs')
    .select('id, source_url, title, artist')
    .eq('link_status', 'done')
    .is('links_by_platform', null)
    .limit(batchSize);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  if (!songs || songs.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, remaining: 0, message: 'nothing to backfill' }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  const results: Array<{
    id: string;
    title: string;
    status: string;
    platforms?: number;
    hasSpotify?: boolean;
    hasApple?: boolean;
    detail?: string;
  }> = [];

  let cacheHits = 0;
  let odesliCalls = 0;
  let failed = 0;
  let rateLimited = false;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i] as { id: string; source_url: string | null; title: string; artist: string | null };
    const labelTitle = song.artist ? `${song.title} · ${song.artist}` : song.title;

    if (!song.source_url) {
      results.push({ id: song.id, title: labelTitle, status: 'skipped', detail: 'no source_url' });
      continue;
    }

    // Stage 1: cache check
    const { data: cached } = await sb
      .from('song_cache')
      .select('payload')
      .eq('source_url', song.source_url)
      .maybeSingle();

    const cachedPayload = cached?.payload as
      | { songlinkUrl?: string; linksByPlatform?: Record<string, { url: string }> }
      | null;
    const cachedLinks = cachedPayload?.linksByPlatform;

    if (cachedLinks && Object.keys(cachedLinks).length > 0) {
      await sb.from('songs').update({ links_by_platform: cachedLinks }).eq('id', song.id);
      results.push({
        id: song.id,
        title: labelTitle,
        status: 'cache',
        platforms: Object.keys(cachedLinks).length,
        hasSpotify: !!cachedLinks.spotify,
        hasApple: !!cachedLinks.appleMusic
      });
      cacheHits++;
      continue;
    }

    // Stage 2: Odesli
    const r = await odesli(song.source_url);
    odesliCalls++;

    if ('rateLimited' in r) {
      results.push({ id: song.id, title: labelTitle, status: 'rate-limited' });
      rateLimited = true;
      break;
    }
    if ('error' in r) {
      results.push({ id: song.id, title: labelTitle, status: 'failed', detail: r.error });
      failed++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    // Conservative: do NOT overwrite songlink_url (working data). Only add the
    // per-platform map alongside. Cache gets the fresh data either way.
    await sb
      .from('songs')
      .update({ links_by_platform: r.linksByPlatform })
      .eq('id', song.id);

    await sb.from('song_cache').upsert(
      {
        source_url: song.source_url,
        payload: {
          ...(cachedPayload ?? {}),
          songlinkUrl: r.songlinkUrl,
          linksByPlatform: r.linksByPlatform
        },
        fetched_at: new Date().toISOString()
      },
      { onConflict: 'source_url' }
    );

    const platforms = Object.keys(r.linksByPlatform);
    results.push({
      id: song.id,
      title: labelTitle,
      status: 'odesli',
      platforms: platforms.length,
      hasSpotify: !!r.linksByPlatform.spotify,
      hasApple: !!r.linksByPlatform.appleMusic
    });

    if (i < songs.length - 1) await sleep(RATE_LIMIT_MS);
  }

  const processed = results.filter((r) => r.status === 'cache' || r.status === 'odesli').length;
  const remaining = Math.max(0, (totalRemaining ?? 0) - processed);

  return new Response(
    JSON.stringify(
      {
        processed,
        remaining,
        cacheHits,
        odesliCalls,
        failed,
        rateLimited,
        results
      },
      null,
      2
    ),
    { headers: { 'content-type': 'application/json' } }
  );
});

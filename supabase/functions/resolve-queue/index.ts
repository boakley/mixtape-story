// Resolution worker — runs every minute via pg_cron (see migration 0006).
// Pulls up to 9 pending songs (Odesli's roughly-10-per-minute limit, with
// headroom), looks up each in the `song_cache` first, then falls back to
// Odesli. Writes the result back to `songs` and seeds the cache for next
// time. Stops processing the batch on rate-limit so the next minute's run
// can take over.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ODESLI_ENDPOINT = 'https://api.song.link/v1-alpha.1/links';
const BATCH_SIZE = 9;
const MAX_ATTEMPTS = 3;

type PendingSong = {
  id: string;
  source_url: string | null;
  link_attempts: number;
};

type OdesliResp = {
  pageUrl?: string;
  entityUniqueId?: string;
  entitiesByUniqueId?: Record<string, { title?: string; artistName?: string; thumbnailUrl?: string }>;
};

async function odesli(url: string): Promise<{ payload: Record<string, unknown>; songlinkUrl: string } | { rateLimited: true } | { error: string }> {
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
  if (!data.pageUrl) return { error: 'Odesli response missing pageUrl' };

  const entity =
    data.entityUniqueId && data.entitiesByUniqueId
      ? data.entitiesByUniqueId[data.entityUniqueId]
      : null;

  return {
    songlinkUrl: data.pageUrl,
    payload: {
      songlinkUrl: data.pageUrl,
      title: entity?.title ?? null,
      artist: entity?.artistName ?? null,
      albumArtUrl: entity?.thumbnailUrl ?? null
    }
  };
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const { data: pending, error: pendingErr } = await supabase
    .from('songs')
    .select('id, source_url, link_attempts')
    .eq('link_status', 'pending')
    .order('owner_id', { ascending: true })
    .order('position', { ascending: true })
    .limit(BATCH_SIZE);

  if (pendingErr) {
    return new Response(JSON.stringify({ error: pendingErr.message }), { status: 500 });
  }

  const results: Array<{ id: string; status: string; detail?: string }> = [];

  for (const row of (pending ?? []) as PendingSong[]) {
    if (!row.source_url) {
      await supabase
        .from('songs')
        .update({
          link_status: 'failed',
          link_last_attempt: new Date().toISOString(),
          link_last_error: 'no source_url'
        })
        .eq('id', row.id);
      results.push({ id: row.id, status: 'failed', detail: 'no source_url' });
      continue;
    }

    // Cache hit?
    const { data: cached } = await supabase
      .from('song_cache')
      .select('payload')
      .eq('source_url', row.source_url)
      .maybeSingle();

    if (cached) {
      const payload = cached.payload as { songlinkUrl?: string };
      if (payload?.songlinkUrl) {
        await supabase
          .from('songs')
          .update({
            songlink_url: payload.songlinkUrl,
            link_status: 'done',
            link_last_attempt: new Date().toISOString()
          })
          .eq('id', row.id);
        results.push({ id: row.id, status: 'done', detail: 'cache' });
        continue;
      }
    }

    const r = await odesli(row.source_url);
    if ('rateLimited' in r) {
      results.push({ id: row.id, status: 'rate-limited' });
      break; // give Odesli a minute; next tick picks up
    }
    if ('error' in r) {
      const attempts = row.link_attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await supabase
        .from('songs')
        .update({
          link_status: status,
          link_attempts: attempts,
          link_last_attempt: new Date().toISOString(),
          link_last_error: r.error
        })
        .eq('id', row.id);
      results.push({ id: row.id, status, detail: r.error });
      continue;
    }

    // Success: cache + update.
    await supabase
      .from('song_cache')
      .upsert(
        { source_url: row.source_url, payload: r.payload, fetched_at: new Date().toISOString() },
        { onConflict: 'source_url' }
      );

    await supabase
      .from('songs')
      .update({
        songlink_url: r.songlinkUrl,
        link_status: 'done',
        link_last_attempt: new Date().toISOString(),
        link_last_error: null
      })
      .eq('id', row.id);
    results.push({ id: row.id, status: 'done' });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'content-type': 'application/json' }
  });
});

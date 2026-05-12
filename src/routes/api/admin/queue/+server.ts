import { error, json } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/admin';
import { adminClient } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

type Row = Record<string, unknown>;
type ProfileLink = { handle?: string } | { handle?: string }[] | null;
type PendingRow = {
  id: string;
  position: number;
  title: string;
  artist: string | null;
  source_url: string | null;
  added_at: string;
  link_attempts: number;
  profiles: ProfileLink;
};
type FailedRow = {
  id: string;
  title: string;
  artist: string | null;
  source_url: string | null;
  link_attempts: number;
  link_last_attempt: string | null;
  link_last_error: string | null;
  profiles: ProfileLink;
};
type ResolvedRow = {
  id: string;
  title: string;
  artist: string | null;
  songlink_url: string | null;
  link_last_attempt: string | null;
  profiles: ProfileLink;
};

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!isAdminEmail(user?.email)) throw error(401, 'Not authorized');

  const supa = adminClient();
  const nowMinusHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const nowMinusDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pendingRes, failedRes, recentRes, cacheRes, hourRes, dayRes] = await Promise.all([
    supa
      .from('songs')
      .select('id, position, title, artist, source_url, added_at, link_attempts, owner_id, profiles!inner(handle)')
      .eq('link_status', 'pending')
      .order('added_at')
      .limit(50),
    supa
      .from('songs')
      .select('id, title, artist, source_url, link_attempts, link_last_attempt, link_last_error, owner_id, profiles!inner(handle)')
      .eq('link_status', 'failed')
      .order('link_last_attempt', { ascending: false })
      .limit(50),
    supa
      .from('songs')
      .select('id, title, artist, songlink_url, link_last_attempt, owner_id, profiles!inner(handle)')
      .eq('link_status', 'done')
      .not('link_last_attempt', 'is', null)
      .order('link_last_attempt', { ascending: false })
      .limit(20),
    supa.from('song_cache').select('source_url', { count: 'exact', head: true }),
    supa
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('link_status', 'done')
      .gte('link_last_attempt', nowMinusHour),
    supa
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('link_status', 'done')
      .gte('link_last_attempt', nowMinusDay)
  ]);

  function ownerHandle(p: ProfileLink): string | null {
    if (!p) return null;
    if (Array.isArray(p)) return p[0]?.handle ?? null;
    return p.handle ?? null;
  }

  const pending = ((pendingRes.data ?? []) as unknown as PendingRow[]).map((r) => ({
    id: r.id,
    owner_handle: ownerHandle(r.profiles),
    position: r.position,
    title: r.title,
    artist: r.artist,
    source_url: r.source_url,
    added_at: r.added_at,
    attempts: r.link_attempts
  }));
  const failed = ((failedRes.data ?? []) as unknown as FailedRow[]).map((r) => ({
    id: r.id,
    owner_handle: ownerHandle(r.profiles),
    title: r.title,
    artist: r.artist,
    source_url: r.source_url,
    attempts: r.link_attempts,
    last_error: r.link_last_error,
    last_attempt: r.link_last_attempt
  }));
  const recently_resolved = ((recentRes.data ?? []) as unknown as ResolvedRow[]).map((r) => ({
    id: r.id,
    owner_handle: ownerHandle(r.profiles),
    title: r.title,
    artist: r.artist,
    songlink_url: r.songlink_url,
    resolved_at: r.link_last_attempt
  }));

  return json({
    stats: {
      pending: pendingRes.count ?? pending.length,
      failed: failedRes.count ?? failed.length,
      resolved_last_hour: hourRes.count ?? 0,
      resolved_last_day: dayRes.count ?? 0,
      cache_size: cacheRes.count ?? 0
    },
    pending,
    failed,
    recently_resolved
  });
};

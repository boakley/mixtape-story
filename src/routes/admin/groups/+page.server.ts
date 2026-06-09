import { error } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/admin';
import { adminClient } from '$lib/server/supabase-admin';
import type { PageServerLoad } from './$types';

// Admin view of every group. Mirrors /admin/mixtapes: URL-param-driven
// sort + filter + direction (no JS state), service-role read to bypass
// RLS, projection to a domain-shaped row.

type Sort = 'name' | 'activity';
type Dir = 'asc' | 'desc';
type Filter = 'all' | 'active' | 'empty';

type RawGroupRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  // creator FK: profiles.id == groups.created_by
  creator: { handle: string; display_name: string } | null;
  // memberships (each row is one member; length = member count)
  group_memberships: Array<{ profile_id: string }>;
  // shared mixtapes: each with updated_at and the songs that live in it
  mixtape_group_shares: Array<{
    mixtape: { id: string; updated_at: string; songs: Array<{ id: string }> } | null;
  }>;
};

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!isAdminEmail(user?.email)) throw error(404, 'Not found');

  const sort: Sort = url.searchParams.get('sort') === 'name' ? 'name' : 'activity';
  const dir: Dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const rawFilter = url.searchParams.get('filter');
  const filter: Filter =
    rawFilter === 'active' || rawFilter === 'empty' ? rawFilter : 'all';

  const admin = adminClient();
  const { data, error: queryErr } = await admin
    .from('groups')
    .select(
      `
      id, slug, name, created_at,
      creator:profiles!created_by ( handle, display_name ),
      group_memberships ( profile_id ),
      mixtape_group_shares (
        mixtape:mixtapes ( id, updated_at, songs(id) )
      )
    `
    );
  if (queryErr) throw error(500, queryErr.message);

  const rows = ((data ?? []) as unknown as RawGroupRow[]).map((g) => {
    const memberCount = g.group_memberships.length;

    // A mixtape "counts" as a real shared mixtape when it has ≥1 song.
    // Empty shares don't represent activity — matches the landing's
    // "look what we've made, not a join roster" rule.
    let activeMixtapeCount = 0;
    let lastActivity = g.created_at;
    for (const share of g.mixtape_group_shares) {
      const mt = share.mixtape;
      if (!mt) continue;
      if (mt.songs.length > 0) activeMixtapeCount += 1;
      if (mt.updated_at > lastActivity) lastActivity = mt.updated_at;
    }

    return {
      id: g.id,
      slug: g.slug,
      name: g.name,
      creatorHandle: g.creator?.handle ?? null,
      creatorName: g.creator?.display_name ?? null,
      memberCount,
      activeMixtapeCount,
      lastActivity,
      createdAt: g.created_at
    };
  });

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.activeMixtapeCount > 0).length,
    empty: rows.filter((r) => r.activeMixtapeCount === 0).length
  };

  let filtered = rows;
  if (filter === 'active') filtered = rows.filter((r) => r.activeMixtapeCount > 0);
  else if (filter === 'empty') filtered = rows.filter((r) => r.activeMixtapeCount === 0);

  filtered.sort((a, b) => {
    const cmp =
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : a.lastActivity.localeCompare(b.lastActivity);
    return dir === 'asc' ? cmp : -cmp;
  });

  return { rows: filtered, sort, dir, filter, counts };
};

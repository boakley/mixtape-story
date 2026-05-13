import { error } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/admin';
import { adminClient } from '$lib/server/supabase-admin';
import type { PageServerLoad } from './$types';

type Sort = 'name' | 'edited';
type Dir = 'asc' | 'desc';
type Filter = 'all' | 'empty' | 'nonempty';

type ProfileWithSongs = {
  id: string;
  handle: string;
  display_name: string;
  created_at: string;
  songs: Array<{
    id: string;
    added_at: string;
    stories: { text: string; updated_at: string } | { text: string; updated_at: string }[] | null;
  }>;
};

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!isAdminEmail(user?.email)) throw error(404, 'Not found');

  const sort: Sort = url.searchParams.get('sort') === 'name' ? 'name' : 'edited';
  const dir: Dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const rawFilter = url.searchParams.get('filter');
  const filter: Filter =
    rawFilter === 'empty' || rawFilter === 'nonempty' ? rawFilter : 'all';

  // Service-role: read everyone's data regardless of RLS.
  const admin = adminClient();
  const { data, error: queryErr } = await admin
    .from('profiles')
    .select('id, handle, display_name, created_at, songs(id, added_at, stories(text, updated_at))');

  if (queryErr) throw error(500, queryErr.message);

  const rows = ((data ?? []) as ProfileWithSongs[]).map((p) => {
    let lastEdited = p.created_at;
    let storyCount = 0;
    for (const song of p.songs) {
      if (song.added_at > lastEdited) lastEdited = song.added_at;
      const story = Array.isArray(song.stories) ? song.stories[0] : song.stories;
      if (story) {
        if (story.text && story.text.trim() !== '') storyCount += 1;
        if (story.updated_at && story.updated_at > lastEdited) lastEdited = story.updated_at;
      }
    }
    return {
      id: p.id,
      handle: p.handle,
      displayName: p.display_name,
      songCount: p.songs.length,
      storyCount,
      lastEdited,
      createdAt: p.created_at
    };
  });

  const counts = {
    all: rows.length,
    empty: rows.filter((r) => r.songCount === 0).length,
    nonempty: rows.filter((r) => r.songCount > 0).length
  };

  let filtered = rows;
  if (filter === 'empty') filtered = rows.filter((r) => r.songCount === 0);
  else if (filter === 'nonempty') filtered = rows.filter((r) => r.songCount > 0);

  filtered.sort((a, b) => {
    const cmp =
      sort === 'name'
        ? a.displayName.localeCompare(b.displayName)
        : a.lastEdited.localeCompare(b.lastEdited);
    return dir === 'asc' ? cmp : -cmp;
  });

  return { rows: filtered, sort, dir, filter, counts };
};

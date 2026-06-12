import type { adminClient } from './supabase-admin';

// "Start this mixtape from a copy of another." Pure row-shaping
// builders (unit-tested) + the orchestrator that does the round trips.
// A copy is a full fork: songs, stories, memory years — fully
// independent afterward. No syncing, no shared rows; that's the
// product decision, not a shortcut.

type AdminClient = ReturnType<typeof adminClient>;

// Everything content-shaped survives the copy; identity (id) and
// provenance (added_at) don't. owner_id/mixtape_id re-home to the
// target.
const CLONED_SONG_COLUMNS =
  'id, position, title, artist, album, release_year, memory_year, isrc, ' +
  'album_art_url, preview_url, source_url, songlink_url, links_by_platform, link_status';

type SourceSongRow = { id: string; [key: string]: unknown };

export function cloneSongRows(
  rows: SourceSongRow[],
  target: { mixtapeId: string; ownerId: string }
): Record<string, unknown>[] {
  return rows.map(({ id: _id, added_at: _addedAt, owner_id: _o, mixtape_id: _m, ...rest }) => ({
    ...rest,
    mixtape_id: target.mixtapeId,
    owner_id: target.ownerId
  }));
}

export function cloneStoryRows(
  idMap: Record<string, string>,
  stories: { song_id: string; text: string }[]
): { song_id: string; text: string }[] {
  return stories.flatMap((s) => {
    const mapped = idMap[s.song_id];
    return mapped ? [{ song_id: mapped, text: s.text }] : [];
  });
}

/**
 * Copy every song (and its story) from `sourceId` into the existing,
 * empty mixtape `targetId`. Caller is responsible for having
 * validated that both mixtapes belong to the same owner.
 */
export async function copyMixtapeInto(
  admin: AdminClient,
  sourceId: string,
  targetId: string
): Promise<void> {
  const { data: target, error: tErr } = await admin
    .from('mixtapes')
    .select('profile_id')
    .eq('id', targetId)
    .maybeSingle();
  if (tErr || !target) throw new Error(`copyMixtapeInto: target missing: ${tErr?.message}`);

  const { data: sourceSongs, error: sErr } = await admin
    .from('songs')
    .select(CLONED_SONG_COLUMNS)
    .eq('mixtape_id', sourceId)
    .order('position');
  if (sErr) throw new Error(`copyMixtapeInto: source songs: ${sErr.message}`);
  if (!sourceSongs || sourceSongs.length === 0) return;

  const sources = sourceSongs as unknown as SourceSongRow[];
  const clones = cloneSongRows(sources, {
    mixtapeId: targetId,
    ownerId: target.profile_id as string
  });

  // INSERT … RETURNING preserves input order, so source[i] → inserted[i].
  const { data: inserted, error: insErr } = await admin
    .from('songs')
    .insert(clones)
    .select('id');
  if (insErr || !inserted) throw new Error(`copyMixtapeInto: insert songs: ${insErr?.message}`);

  // Loose payload → supabase-js can't type the returning rows; cast at
  // the boundary.
  const insertedIds = inserted as unknown as { id: string }[];
  const idMap: Record<string, string> = {};
  sources.forEach((source, i) => {
    idMap[source.id] = insertedIds[i]!.id;
  });

  const { data: stories, error: stErr } = await admin
    .from('stories')
    .select('song_id, text')
    .in('song_id', Object.keys(idMap));
  if (stErr) throw new Error(`copyMixtapeInto: source stories: ${stErr.message}`);

  const storyRows = cloneStoryRows(idMap, (stories ?? []) as { song_id: string; text: string }[]);
  if (storyRows.length > 0) {
    const { error: storyErr } = await admin.from('stories').insert(storyRows);
    if (storyErr) throw new Error(`copyMixtapeInto: insert stories: ${storyErr.message}`);
  }
}

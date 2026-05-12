import { error } from '@sveltejs/kit';
import { renderStory } from '$lib/server/markdown';
import type { DisplaySong, ProfileRow, SongRow } from '$lib/types';
import type { PageServerLoad } from './$types';

type SongWithStory = SongRow & { stories: { text: string } | { text: string }[] | null };

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .eq('handle', params.handle)
    .maybeSingle<Pick<ProfileRow, 'id' | 'handle' | 'display_name'>>();

  if (!profile) throw error(404, 'Mixtape not found');

  const { data: rows, error: songsErr } = await supabase
    .from('songs')
    .select(
      'id, position, title, artist, album, release_year, memory_year, album_art_url, songlink_url, preview_url, link_status, stories(text)'
    )
    .eq('owner_id', profile.id)
    .order('position');

  if (songsErr) throw error(500, songsErr.message);

  const songs: DisplaySong[] = (rows ?? []).map((row) => {
    const r = row as unknown as SongWithStory;
    const storyRel = Array.isArray(r.stories) ? r.stories[0] : r.stories;
    const storyText = storyRel?.text ?? '';
    return {
      id: r.id,
      position: r.position,
      title: r.title,
      artist: r.artist,
      album: r.album,
      releaseYear: r.release_year,
      memoryYear: r.memory_year,
      albumArtUrl: r.album_art_url,
      songlinkUrl: r.songlink_url,
      previewUrl: r.preview_url,
      linkStatus: r.link_status,
      storyText,
      storyHtml: renderStory(storyText)
    };
  });

  return {
    handle: profile.handle,
    displayName: profile.display_name,
    songs
  };
};

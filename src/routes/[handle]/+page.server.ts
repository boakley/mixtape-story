import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { renderStory } from '$lib/server/markdown';
import { adminClient } from '$lib/server/supabase-admin';
import type { DisplaySong, ProfileRow, SongRow } from '$lib/types';
import type { PageServerLoad } from './$types';

const VISITOR_COOKIE = 'mxs_visitor';
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type SongWithStory = SongRow & { stories: { text: string } | { text: string }[] | null };

export const load: PageServerLoad = async ({
  params,
  cookies,
  locals: { supabase, safeGetSession }
}) => {
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

  // Visit tracking. The owner's own visits don't count. Authenticated
  // non-owners dedupe by user.id; anon visitors get a long-lived
  // httpOnly cookie that dedupes them per mixtape.
  const { user } = await safeGetSession();
  const isOwner = user?.id === profile.id;

  if (!isOwner) {
    let visitorId: string;
    if (user) {
      visitorId = `user:${user.id}`;
    } else {
      let token = cookies.get(VISITOR_COOKIE);
      if (!token) {
        token = crypto.randomUUID();
        cookies.set(VISITOR_COOKIE, token, {
          path: '/',
          maxAge: VISITOR_COOKIE_MAX_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: !dev
        });
      }
      visitorId = `anon:${token}`;
    }

    // RLS denies anon/authenticated writes — go through service-role.
    await adminClient()
      .from('mixtape_visits')
      .upsert(
        {
          profile_id: profile.id,
          visitor_id: visitorId,
          last_visit_at: new Date().toISOString()
        },
        { onConflict: 'profile_id,visitor_id' }
      );
  }

  let visitorCount: number | null = null;
  if (isOwner) {
    const { count } = await supabase
      .from('mixtape_visits')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', profile.id);
    visitorCount = count ?? 0;
  }

  return {
    handle: profile.handle,
    displayName: profile.display_name,
    songs,
    visitorCount
  };
};

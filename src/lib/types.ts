// Database-facing types — what the editor and reader pages traffic in.
// Schema lives in supabase/migrations/0003_songs.sql.

export type LinkStatus = 'pending' | 'done' | 'failed' | 'manual';

export type SongRow = {
  id: string;
  owner_id: string;
  position: number;
  title: string;
  artist: string | null;
  album: string | null;
  release_year: number | null;
  memory_year: number | null;
  isrc: string | null;
  album_art_url: string | null;
  preview_url: string | null;
  source_url: string | null;
  songlink_url: string | null;
  link_status: LinkStatus;
  link_attempts: number;
  link_last_attempt: string | null;
  link_last_error: string | null;
  added_at: string;
};

export type StoryRow = {
  song_id: string;
  text: string;
  updated_at: string;
};

export type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  created_at: string;
};

// Display shape for the /{handle} read path.
export type DisplaySong = {
  id: string;
  position: number;
  title: string;
  artist: string | null;
  album: string | null;
  releaseYear: number | null;
  memoryYear: number | null;
  albumArtUrl: string | null;
  songlinkUrl: string | null;
  previewUrl: string | null;
  linkStatus: LinkStatus;
  storyHtml: string;
  storyText: string;
};

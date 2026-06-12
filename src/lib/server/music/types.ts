export type Track = {
  title: string;
  artist: string | null;
  album: string | null;
  releaseYear: number | null;
  isrc: string | null;
  albumArtUrl: string | null;
  /** 30-second m4a sample, no auth, inline-playable. Populated by iTunes Search. */
  previewUrl: string | null;
  sourceUrl: string;
};

export type UrlKind = 'playlist' | 'song';

/** Shape of a song_cache payload row — what the Odesli worker stores. */
export type CachedSongPayload = {
  songlinkUrl?: string;
  linksByPlatform?: Record<string, { url: string }>;
};

export interface MusicService {
  name: string;
  matchUrl(url: string): UrlKind | null;
  fetchSong(url: string): Promise<Track>;
  fetchPlaylist(url: string): Promise<Track[]>;
}

export class MusicServiceError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MusicServiceError';
  }
}

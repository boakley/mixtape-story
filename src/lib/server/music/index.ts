import { odesliFallback } from './odesli';
import type { Track } from './types';

export type { Track, UrlKind, MusicService } from './types';
export { MusicServiceError } from './types';
export { odesliLookup, RateLimited } from './odesli';

/**
 * Single-song URL resolution. The primary editor input is a text-list paste
 * (see `parse-list.ts` + `itunes.ts`); this path handles "I just found this
 * song, here's the link" one-offs. Any streaming-service URL Odesli can
 * resolve works — Apple Music, Spotify, YouTube Music, Tidal, Deezer, etc.
 *
 * No playlist support — the design pivoted away from scraping playlist pages
 * because user-created playlists can't be reached without the official Apple
 * Music API, and the simpler text-list paste covers every service uniformly.
 */
export async function resolveSong(url: string): Promise<Track> {
  return odesliFallback(url.trim());
}

/**
 * Strip tracking params (`?si=...`, `&utm_...`) so cache hits work across users
 * who pasted the "same" URL with different referrer tokens.
 */
export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key === 'si' || key.startsWith('utm_')) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

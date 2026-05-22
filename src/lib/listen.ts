import type { DisplaySong } from './types';

// A visitor's preferred streaming service for the "Listen with" chip.
// `null` means no preference — fall back to the universal Odesli page.
export type ListenPref = 'apple' | 'spotify' | 'youtube';

export const LISTEN_PREF_COOKIE = 'mxs_listen_pref';

type ServiceConfig = {
  label: string;
  // Tooltip shown on the "Listen with" chip option.
  tooltip: string;
  // The key Odesli uses in linksByPlatform for this service's direct link.
  platformKey: string;
  // Public search-results URL — works for any visitor with no API/credentials.
  // The fallback when we don't have a direct link, which (as of 2026-05) is
  // *always* the case for Spotify and YouTube since Odesli stopped surfacing
  // those platforms. See reference_spotify_api_blocked memory / PHASE-2 doc.
  searchUrl: (query: string) => string;
};

export const LISTEN_SERVICES: Record<ListenPref, ServiceConfig> = {
  apple: {
    label: 'Apple',
    tooltip: 'Open songs in Apple Music',
    platformKey: 'appleMusic',
    searchUrl: (q) => `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`
  },
  spotify: {
    label: 'Spotify',
    tooltip: 'Open songs in Spotify',
    platformKey: 'spotify',
    searchUrl: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`
  },
  youtube: {
    label: 'YouTube',
    tooltip: 'Open songs in YouTube Music',
    platformKey: 'youtubeMusic',
    searchUrl: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`
  }
};

export const OTHER_LISTEN_TOOLTIP =
  'Open a universal link where you pick your app';

export function isListenPref(value: string | null | undefined): value is ListenPref {
  return value === 'apple' || value === 'spotify' || value === 'youtube';
}

type SongLike = Pick<DisplaySong, 'title' | 'artist' | 'songlinkUrl' | 'linksByPlatform'>;

/**
 * Where the "→ Listen" button should point for a given song and visitor
 * preference.
 *
 * - No preference → the universal Odesli redirector (`songlinkUrl`). May be
 *   null if the song hasn't resolved yet.
 * - Preference set → the direct per-platform link if we have it; otherwise the
 *   service's public search URL (always available from title + artist). This
 *   means a preference always yields a usable destination, even for songs
 *   still pending resolution.
 */
export function listenHref(song: SongLike, pref: ListenPref | null): string | null {
  if (!pref) return song.songlinkUrl;

  const svc = LISTEN_SERVICES[pref];
  const direct = song.linksByPlatform?.[svc.platformKey]?.url;
  if (direct) return direct;

  const query = song.artist ? `${song.title} ${song.artist}` : song.title;
  return svc.searchUrl(query);
}

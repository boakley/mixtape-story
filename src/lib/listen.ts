import type { DisplaySong } from './types';

// A visitor's preferred streaming service for the "Listen with" choice.
//
// - 'apple' | 'spotify' | 'youtube' → deep-link to that service.
// - 'other' → user picked the Odesli chooser page explicitly (so we
//   know not to re-prompt with the first-Listen modal).
// - `null` → no preference set yet. First Listen tap on the mixtape
//   page pops the chooser modal.
export type ListenPref = 'apple' | 'spotify' | 'youtube' | 'other';

// Type for the subset of ListenPref values that have an actual
// deep-linkable service entry in LISTEN_SERVICES below. 'other' is a
// pref but not a service — it routes to Odesli, same as null.
export type ListenService = Exclude<ListenPref, 'other'>;

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

export const LISTEN_SERVICES: Record<ListenService, ServiceConfig> = {
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
  return (
    value === 'apple' ||
    value === 'spotify' ||
    value === 'youtube' ||
    value === 'other'
  );
}

/**
 * Set or clear the LISTEN_PREF_COOKIE in document.cookie. Single source
 * of truth so the ListenChooser modal and ListenWithChip both go
 * through the same write — no drift on max-age, samesite, etc.
 *
 * Pass null to clear (e.g. "reset to no preference" from settings, if
 * we ever add that). Routine writes pass an actual ListenPref.
 */
export function writeListenPrefCookie(pref: ListenPref | null): void {
  if (typeof document === 'undefined') return;
  if (pref) {
    document.cookie = `${LISTEN_PREF_COOKIE}=${pref}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } else {
    document.cookie = `${LISTEN_PREF_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
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
  // 'other' = user explicitly chose the Odesli chooser. Same destination
  // as no-preference, but it stops the first-Listen modal from popping.
  if (!pref || pref === 'other') return song.songlinkUrl;

  const svc = LISTEN_SERVICES[pref];
  const direct = song.linksByPlatform?.[svc.platformKey]?.url;
  if (direct) return direct;

  const query = song.artist ? `${song.title} ${song.artist}` : song.title;
  return svc.searchUrl(query);
}

import type { Track } from './types';
import { MusicServiceError } from './types';

const ENDPOINT = 'https://itunes.apple.com/search';

type ItunesResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  isrc?: string;
  previewUrl?: string;
};

type ItunesResponse = {
  resultCount: number;
  results: ItunesResult[];
};

function toTrack(r: ItunesResult, query: string): Track {
  const releaseYear = r.releaseDate ? Number(r.releaseDate.slice(0, 4)) || null : null;
  // Bump the 100-px artwork to a larger size; Apple supports arbitrary sizes by URL.
  const artwork = r.artworkUrl100 ?? r.artworkUrl60 ?? null;
  const albumArtUrl = artwork ? artwork.replace(/\/\d+x\d+([a-z]*\.jpg)$/, '/600x600$1') : null;
  return {
    title: r.trackName ?? query,
    artist: r.artistName ?? null,
    album: r.collectionName ?? null,
    releaseYear,
    isrc: r.isrc ?? null,
    albumArtUrl,
    previewUrl: r.previewUrl ?? null,
    sourceUrl: r.trackViewUrl ?? ''
  };
}

async function fetchSearch(term: string, limit: number): Promise<ItunesResult[]> {
  const url = `${ENDPOINT}?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new MusicServiceError(`Couldn't reach iTunes Search`, err);
  }
  if (res.status === 403 || res.status === 429) {
    throw new MusicServiceError('iTunes Search rate-limited; try again in a moment.');
  }
  if (!res.ok) {
    throw new MusicServiceError(`iTunes Search returned ${res.status}`);
  }
  const data = (await res.json()) as ItunesResponse;
  return data.results ?? [];
}

/**
 * Pure iTunes Search call. Returns up to `limit` Track candidates. No caching;
 * callers that want to share an API call across users should go through
 * `itunes-cache.ts` instead.
 */
export async function searchTracks(query: string, limit = 8): Promise<Track[]> {
  const results = await fetchSearch(query, limit);
  return results.map((r) => toTrack(r, query));
}

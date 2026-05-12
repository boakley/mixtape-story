import type { Track } from './types';
import { MusicServiceError } from './types';

const ODESLI_ENDPOINT = 'https://api.song.link/v1-alpha.1/links';

type OdesliEntity = {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  apiProvider?: string;
};

type OdesliResponse = {
  pageUrl?: string;
  entityUniqueId?: string;
  entitiesByUniqueId?: Record<string, OdesliEntity>;
  linksByPlatform?: Record<string, { url?: string }>;
};

export type OdesliResult = {
  songlinkUrl: string;
  title: string | null;
  artist: string | null;
  albumArtUrl: string | null;
};

export class RateLimited extends Error {
  constructor(public retryAfterSeconds: number | null) {
    super('Odesli rate limited');
    this.name = 'RateLimited';
  }
}

export async function odesliLookup(url: string): Promise<OdesliResult> {
  const endpoint = `${ODESLI_ENDPOINT}?url=${encodeURIComponent(url)}`;
  let res: Response;
  try {
    res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new MusicServiceError(`Couldn't reach Odesli`, err);
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    throw new RateLimited(retryAfter ? Number(retryAfter) : null);
  }
  if (!res.ok) {
    throw new MusicServiceError(`Odesli returned ${res.status} for ${url}`);
  }
  const data = (await res.json()) as OdesliResponse;
  const songlinkUrl = data.pageUrl;
  if (!songlinkUrl) {
    throw new MusicServiceError(`Odesli response missing pageUrl for ${url}`);
  }
  const entity =
    data.entityUniqueId && data.entitiesByUniqueId
      ? data.entitiesByUniqueId[data.entityUniqueId]
      : null;
  return {
    songlinkUrl,
    title: entity?.title ?? null,
    artist: entity?.artistName ?? null,
    albumArtUrl: entity?.thumbnailUrl ?? null
  };
}

/**
 * Fallback path for URLs no adapter recognizes (Spotify, YouTube Music, Tidal, ...).
 * Builds a Track from whatever Odesli can tell us.
 */
export async function odesliFallback(url: string): Promise<Track> {
  const r = await odesliLookup(url);
  return {
    title: r.title ?? '(unknown title)',
    artist: r.artist,
    album: null,
    releaseYear: null,
    isrc: null,
    albumArtUrl: r.albumArtUrl,
    previewUrl: null,
    sourceUrl: url
  };
}

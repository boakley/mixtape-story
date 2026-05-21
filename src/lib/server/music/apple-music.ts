import { env } from '$env/dynamic/private';
import type { Track } from './types';
import { MusicServiceError } from './types';

// Apple Music API client. Replaces iTunes Search as our resolver source —
// same Track shape, better ISRC bridging through Odesli (Apple's catalog
// graph is what Odesli aligns to most reliably).
//
// Credentials: APPLE_MUSIC_KEY_ID / APPLE_MUSIC_TEAM_ID / APPLE_MUSIC_PRIVATE_KEY
// must be set as Cloudflare Pages secrets (prod) and in .env.local (dev).
// Smoke-tested via scripts/test-apple-music.mjs.

const STOREFRONT = 'us';
const ENDPOINT = `https://api.music.apple.com/v1/catalog/${STOREFRONT}`;

// Apple allows JWTs valid for up to 6 months. We sign for 90 days and
// re-sign when within 1 hour of expiry. Module-level so the cost is paid
// once per Worker isolate, not once per request.
const JWT_TTL_SECONDS = 90 * 24 * 60 * 60;
const JWT_REFRESH_BUFFER_SECONDS = 60 * 60;

let cachedJwt: string | null = null;
let cachedJwtExpiresAt = 0;

function readCredentials(): { keyId: string; teamId: string; privateKeyPem: string } {
  const keyId = env.APPLE_MUSIC_KEY_ID;
  const teamId = env.APPLE_MUSIC_TEAM_ID;
  const privateKeyPem = env.APPLE_MUSIC_PRIVATE_KEY;
  if (!keyId || !teamId || !privateKeyPem) {
    throw new MusicServiceError(
      'Apple Music credentials missing. Set APPLE_MUSIC_KEY_ID, APPLE_MUSIC_TEAM_ID, and APPLE_MUSIC_PRIVATE_KEY.'
    );
  }
  return { keyId, teamId, privateKeyPem };
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(s));
}

function base64UrlEncodeBytes(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(keyId: string, teamId: string, privateKeyPem: string): Promise<string> {
  let keyData: ArrayBuffer;
  try {
    keyData = pemToPkcs8(privateKeyPem);
  } catch (e) {
    throw new MusicServiceError('APPLE_MUSIC_PRIVATE_KEY is not valid PEM.', e);
  }

  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } catch (e) {
    throw new MusicServiceError('Could not import Apple Music private key.', e);
  }

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: teamId, iat: now, exp: now + JWT_TTL_SECONDS };
  const signingInput =
    `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncodeBytes(signature)}`;
}

/**
 * Returns a valid developer JWT for the Apple Music API. Cached at module
 * scope and re-signed only when within ~1 hour of expiry.
 */
export async function getAppleMusicJwt(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwtExpiresAt - nowSec > JWT_REFRESH_BUFFER_SECONDS) {
    return cachedJwt;
  }
  const { keyId, teamId, privateKeyPem } = readCredentials();
  const jwt = await signJwt(keyId, teamId, privateKeyPem);
  cachedJwt = jwt;
  cachedJwtExpiresAt = nowSec + JWT_TTL_SECONDS;
  return jwt;
}

// ---- Search --------------------------------------------------------------

type AppleArtwork = {
  url?: string;
  width?: number;
  height?: number;
};
type AppleSongAttributes = {
  name?: string;
  artistName?: string;
  albumName?: string;
  releaseDate?: string;
  isrc?: string;
  url?: string;
  artwork?: AppleArtwork;
  previews?: Array<{ url?: string }>;
};
type AppleSong = {
  id: string;
  type: 'songs';
  attributes?: AppleSongAttributes;
};
type AppleSearchResponse = {
  results?: {
    songs?: {
      data?: AppleSong[];
    };
  };
};

function expandArtwork(template: string | undefined, size = 600): string | null {
  if (!template) return null;
  // Apple's artwork URLs contain `{w}` and `{h}` placeholders.
  return template.replace('{w}', String(size)).replace('{h}', String(size));
}

function toTrack(s: AppleSong, fallbackQuery: string): Track {
  const a = s.attributes ?? {};
  const releaseYear = a.releaseDate ? Number(a.releaseDate.slice(0, 4)) || null : null;
  return {
    title: a.name ?? fallbackQuery,
    artist: a.artistName ?? null,
    album: a.albumName ?? null,
    releaseYear,
    isrc: a.isrc ?? null,
    albumArtUrl: expandArtwork(a.artwork?.url),
    previewUrl: a.previews?.[0]?.url ?? null,
    sourceUrl: a.url ?? ''
  };
}

/**
 * Apple Music catalog search. Same signature as the iTunes Search wrapper
 * (`searchTracks(query, limit?) → Track[]`) so callers can swap services
 * without changing call sites.
 */
export async function searchTracks(query: string, limit = 8): Promise<Track[]> {
  const jwt = await getAppleMusicJwt();
  const url =
    `${ENDPOINT}/search?term=${encodeURIComponent(query)}&types=songs&limit=${Math.min(limit, 25)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
  } catch (err) {
    throw new MusicServiceError(`Couldn't reach Apple Music`, err);
  }

  if (res.status === 401) {
    // Invalidate the cached JWT so the next call re-signs. Could be that
    // the developer revoked the key — but more often it's a transient blip,
    // so we surface a retryable error rather than failing hard.
    cachedJwt = null;
    cachedJwtExpiresAt = 0;
    throw new MusicServiceError('Apple Music rejected the developer token (401).');
  }
  if (res.status === 429) {
    throw new MusicServiceError('Apple Music rate-limited; try again in a moment.');
  }
  if (!res.ok) {
    throw new MusicServiceError(`Apple Music returned ${res.status}`);
  }

  const data = (await res.json()) as AppleSearchResponse;
  const songs = data.results?.songs?.data ?? [];
  return songs.map((s) => toTrack(s, query));
}

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Per-mixtape OG image source — 1080×1080 SVG, typography-only,
// artist-name-first per the "company we're in" design memo. Dedupes repeat
// artists (same band can show up twice per the moments-not-identities
// principle) and shows up to 5 wrapped lines plus a "…and N more" tail.
//
// Why square (not the 1200×630 Twitter/Facebook standard)?
// WhatsApp + iMessage render hero previews only for square-ish images;
// landscape 1200×630 collapses to a tiny left-side thumbnail and the
// typography becomes unreadable. The writing-group audience lives in
// those two clients, so we optimize for them. Twitter/Discord/Slack
// render the square image fine — slightly different card layout, still
// legible.
//
// SVG, not PNG. The render-og Supabase Edge Function consumes this
// endpoint and rasterizes via @resvg/resvg-wasm (Deno-native, no
// Cloudflare-Workers wasm-bindgen friction). The PNG that social
// platforms actually fetch is the Storage URL written by that function.

const PAPER = '#fdfcf8';
const INK = '#1a1816';
const INK_MUTED = '#6b6660';
const RULE = '#e8e3da';

// Cassette brand mark — kept in sync with static/favicon.svg so the OG card
// and the favicon share one identity.
const CASSETTE_SVG = `
  <rect x="6" y="22" width="88" height="56" rx="5" fill="#1a1714"/>
  <rect x="42" y="30" width="16" height="3" rx="1.5" fill="#f5f0e6"/>
  <circle cx="32" cy="46" r="9" fill="#f5f0e6"/>
  <circle cx="32" cy="46" r="3.8" fill="#1a1714"/>
  <circle cx="68" cy="46" r="9" fill="#f5f0e6"/>
  <circle cx="68" cy="46" r="3.8" fill="#1a1714"/>
  <rect x="41" y="45.25" width="18" height="1.5" fill="#f5f0e6"/>
  <rect x="14" y="62" width="72" height="12" rx="2" fill="#f5f0e6"/>
`;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap a long single-line string across up to `maxLines` lines, breaking on
 * separators. Returns the lines as separate strings. SVG `<text>` doesn't
 * wrap natively, so we render multiple lines.
 */
function wrapAtSeparator(
  text: string,
  separator: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const parts = text.split(separator);
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current ? `${current}${separator}${part}` : part;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = part;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export const GET: RequestHandler = async ({ params, locals: { supabase }, setHeaders }) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .eq('handle', params.handle)
    .maybeSingle<{ id: string; handle: string; display_name: string }>();

  if (!profile) throw error(404, 'Mixtape not found');

  // Scope songs to the personal mixtape, matching the reader page —
  // defense in depth now that group shares exist. No mixtape (very old
  // profile not yet backfilled) renders the empty-state card.
  const { data: personalMixtape } = await supabase
    .from('mixtapes')
    .select('id')
    .eq('profile_id', profile.id)
    .is('slug', null)
    .maybeSingle<{ id: string }>();

  const { data: songs } = personalMixtape
    ? await supabase
        .from('songs')
        .select('artist, position')
        .eq('mixtape_id', personalMixtape.id)
        .order('position')
    : { data: [] };

  // Dedupe artists in mixtape order, case-insensitive, skipping empties.
  const seen = new Set<string>();
  const uniqueArtists: string[] = [];
  for (const row of (songs ?? []) as { artist: string | null }[]) {
    const a = row.artist?.trim();
    if (!a) continue;
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueArtists.push(a);
  }

  const VISIBLE = 10;
  const visible = uniqueArtists.slice(0, VISIBLE);
  const remaining = uniqueArtists.length - visible.length;

  const title = `${profile.display_name}'s mixtape`;
  const artistLine = visible.length > 0 ? visible.join(' · ') : 'A mixtape, waiting to begin';
  const tail = remaining > 0 ? `…and ${remaining} more` : '';
  // Square canvas is 1080 wide with 88px gutters → ~904px of usable width.
  // At 44px serif, average char width is ~24px → ~37 chars/line. Five lines
  // fits ~185 chars of artist text, which covers most mixtapes in full.
  const artistLines = wrapAtSeparator(artistLine, ' · ', 37, 5);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <rect width="1080" height="1080" fill="${PAPER}"/>

  <text x="88" y="140" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="26" letter-spacing="3" fill="${INK_MUTED}">
    MIXTAPESTORY.COM
  </text>

  <text x="88" y="260" font-family="'Iowan Old Style', 'Palatino Linotype', Georgia, serif" font-size="92" fill="${INK}">
    ${escapeXml(title)}
  </text>

  <line x1="88" y1="320" x2="992" y2="320" stroke="${RULE}" stroke-width="1"/>

  ${artistLines
    .map(
      (line, i) =>
        `<text x="88" y="${440 + i * 70}" font-family="'Iowan Old Style', 'Palatino Linotype', Georgia, serif" font-size="44" fill="${INK}">${escapeXml(line)}</text>`
    )
    .join('\n  ')}

  ${
    tail
      ? `<text x="88" y="${440 + artistLines.length * 70 + 14}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="30" fill="${INK_MUTED}">${escapeXml(tail)}</text>`
      : ''
  }

  <!-- cassette brand mark, bottom-right. Typography is left-aligned so the
       right side stays clear regardless of artist-line width. -->
  <g transform="translate(880, 880)">
    ${CASSETTE_SVG}
  </g>
</svg>`;

  setHeaders({
    'content-type': 'image/svg+xml',
    'cache-control': 'public, max-age=300, s-maxage=300'
  });

  return new Response(svg);
};

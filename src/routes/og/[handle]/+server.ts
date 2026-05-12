import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Per-mixtape OG image. 1200x630, typography-only, artist-name-first per the
// "company we're in" design memo: artist names spark curiosity ("which Led
// Zeppelin song?") where song titles would close the loop before someone
// clicks. Dedupes repeat artists (same band can show up twice in a mixtape
// per the moments-not-identities principle) and shows the first 7 in
// mixtape order plus a "…and N more" tail when there are leftovers.
//
// Renders SVG directly for v1. SVG works for Twitter, Discord, Slack, and
// any browser-rendered preview. WhatsApp's preview engine doesn't reliably
// support SVG; rasterization to PNG is a follow-up before we cut over to
// the share-to-WhatsApp flow.

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
 * wrap natively, so we render multiple `<tspan>` rows.
 */
function wrapAtSeparator(text: string, separator: string, maxCharsPerLine: number, maxLines: number): string[] {
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

  const { data: songs } = await supabase
    .from('songs')
    .select('artist, position')
    .eq('owner_id', profile.id)
    .order('position');

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

  const VISIBLE = 7;
  const visible = uniqueArtists.slice(0, VISIBLE);
  const remaining = uniqueArtists.length - visible.length;

  const title = `${profile.display_name}'s mixtape`;
  const artistLine = visible.length > 0 ? visible.join(' · ') : 'A mixtape, waiting to begin';
  const tail = remaining > 0 ? `…and ${remaining} more` : '';
  const artistLines = wrapAtSeparator(artistLine, ' · ', 42, 3);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${PAPER}"/>

  <!-- top bar: site URL chip -->
  <text x="96" y="120" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" letter-spacing="3" fill="${INK_MUTED}">
    MIXTAPESTORY.COM
  </text>

  <!-- title -->
  <text x="96" y="220" font-family="'Iowan Old Style', 'Palatino Linotype', Georgia, serif" font-size="78" fill="${INK}">
    ${escapeXml(title)}
  </text>

  <!-- thin rule -->
  <line x1="96" y1="280" x2="1104" y2="280" stroke="${RULE}" stroke-width="1"/>

  <!-- artist lines -->
  ${artistLines
    .map(
      (line, i) =>
        `<text x="96" y="${380 + i * 60}" font-family="'Iowan Old Style', 'Palatino Linotype', Georgia, serif" font-size="40" fill="${INK}">${escapeXml(line)}</text>`
    )
    .join('\n  ')}

  ${
    tail
      ? `<text x="96" y="${380 + artistLines.length * 60 + 10}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26" fill="${INK_MUTED}">${escapeXml(tail)}</text>`
      : ''
  }

  <!-- cassette brand mark, bottom-right (typography is left-aligned, so the
       right side stays clear regardless of how long the artist lines wrap) -->
  <g transform="translate(1004, 496)">
    ${CASSETTE_SVG}
  </g>
</svg>`;

  setHeaders({
    'content-type': 'image/svg+xml',
    'cache-control': 'public, max-age=300, s-maxage=300'
  });

  return new Response(svg);
};

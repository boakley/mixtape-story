// Shared helpers for the group-landing song-level tabs.
//
// - truncateStory: produces a "first ~2 sentences, capped at ~280 chars"
//   excerpt for the [more] toggle. Runs on plain text so the existing
//   marked() renderer can be applied to both excerpt and full separately
//   without risking split tags. Sentence boundary is [.!?] followed by
//   whitespace or end-of-string.
//
// - normalizeSongKey: dedup key for aggregating "the same song" across
//   members' mixtapes. Prefer ISRC when present; otherwise fall back to
//   normalized title + artist (lowercase, parentheticals stripped, "feat."
//   tail stripped, whitespace collapsed). Title alone is too lossy (every
//   "Africa" would merge); title+artist with the basic normalization is
//   right for v1 at writing-group scale.

export type TruncatedStory = {
  excerpt: string;
  isTruncated: boolean;
};

const MAX_EXCERPT_CHARS = 280;

export function truncateStory(text: string): TruncatedStory {
  if (!text) return { excerpt: '', isTruncated: false };

  // Each match is up-to-and-including a [.!?] terminator + trailing ws.
  // The final unterminated chunk (e.g., text ending mid-sentence) isn't
  // captured; if there are no terminators at all, fall back to whole text.
  const sentenceRe = /[^.!?]*[.!?]+(?:\s+|$)/g;
  const matches = text.match(sentenceRe);

  let candidate = matches && matches.length > 0
    ? matches.slice(0, 2).join('').trimEnd()
    : text;

  const baseTruncated = candidate.length < text.length;

  if (candidate.length > MAX_EXCERPT_CHARS) {
    candidate = candidate.slice(0, MAX_EXCERPT_CHARS).trimEnd() + '…';
    return { excerpt: candidate, isTruncated: true };
  }

  return {
    excerpt: baseTruncated ? candidate + '…' : candidate,
    isTruncated: baseTruncated
  };
}

export function normalizeSongKey(
  title: string,
  artist: string | null,
  isrc: string | null
): string {
  if (isrc) return `isrc:${isrc.toUpperCase()}`;
  return `tn:${normalizeForKey(title)}|${normalizeForKey(artist)}`;
}

function normalizeForKey(s: string | null): string {
  return (s ?? '')
    .toLowerCase()
    // Strip parentheticals (catches "(feat. X)", "(remix)", "(live)").
    .replace(/\s*\([^)]*\)/g, '')
    // Strip "- feat. X" / "- featuring X" suffix.
    .replace(/\s*-\s*(?:feat|featuring|ft)\.?\s.*$/i, '')
    // Strip trailing "feat. X" without dash.
    .replace(/\s+(?:feat|featuring|ft)\.?\s.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

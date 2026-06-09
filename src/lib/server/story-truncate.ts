// Shared helpers for the group-landing song-level tabs.
//
// - truncateStory: produces a "first ~2 sentences, capped at ~280 chars"
//   excerpt for the [more] toggle. Runs on plain text so the existing
//   marked() renderer can be applied to both excerpt and full separately
//   without risking split tags. Sentence boundary is [.!?] followed by
//   whitespace or end-of-string.
//
// - normalizeSongKey: dedup key for aggregating "the same song" across
//   members' mixtapes: normalized title + artist (lowercase,
//   parentheticals stripped, "feat." tail stripped, whitespace
//   collapsed). Title alone is too lossy (every "Africa" would merge).
//
//   Deliberately NOT keyed on ISRC. An ISRC identifies a recording, but
//   this feature asks the human question "did two people pick the same
//   song?" — different releases of one song carry different ISRCs, and
//   an ISRC-when-present key can never match a song row that lacks one
//   (all pre-Apple-Music-API rows do). Audited against prod 2026-06-09:
//   title+artist found every real overlap; ISRC-first added only the
//   asymmetry.

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

export function normalizeSongKey(title: string, artist: string | null): string {
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

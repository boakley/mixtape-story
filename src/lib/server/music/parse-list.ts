/**
 * Parse free-text song lists into per-entry search queries.
 *
 * Recognized input shapes:
 *
 *   1. Quoted-title shape (one or more lines, can be all on one line):
 *        "Angel from Montgomery" John Prine "Beware of Darkness" George Harrison
 *
 *   2. Newline-delimited shape:
 *        Angel from Montgomery — John Prine
 *        Beware of Darkness — George Harrison
 *
 * Annotations in parentheses are stripped from the artist field but kept in
 * `note` so the user can see why a result might not match (e.g. "Bonnie Raitt
 * duet, preferred"). Songwriter slashes (`Composer / Lyricist`) are preserved.
 */

export type ParsedEntry = {
  /** What to search iTunes with — title + cleaned artist, no annotations. */
  query: string;
  /** Original line/segment, shown back to the user in the preview screen. */
  raw: string;
  /** Best guess at the title (display only; not used in the query). */
  title: string | null;
  /** Best guess at the artist (display only). */
  artist: string | null;
  /** Parenthetical annotation, if any. */
  note: string | null;
};

// Smart quotes + straight quotes, opening and closing.
const OPEN_QUOTES = '"“';
const CLOSE_QUOTES = '"”';
const ANY_QUOTE = '"“”';

const QUOTED_RE = new RegExp(
  `[${OPEN_QUOTES}]([^${ANY_QUOTE}]+?)[${CLOSE_QUOTES}]\\s*([^${ANY_QUOTE}]*?)(?=\\s*[${OPEN_QUOTES}]|$)`,
  'gu'
);

function stripParens(s: string): { clean: string; note: string | null } {
  const parens = s.match(/\(([^()]+)\)/);
  if (!parens) return { clean: s.trim(), note: null };
  const note = parens[1]?.trim() ?? null;
  return { clean: s.replace(/\s*\([^()]+\)\s*/g, ' ').replace(/\s+/g, ' ').trim(), note };
}

function makeEntry(title: string | null, artistRaw: string | null, raw: string): ParsedEntry | null {
  const titleClean = title?.trim() || null;
  const artistInfo = artistRaw ? stripParens(artistRaw) : { clean: '', note: null };
  const artistClean = artistInfo.clean || null;
  const queryParts = [titleClean, artistClean].filter(Boolean);
  if (queryParts.length === 0) return null;
  return {
    query: queryParts.join(' '),
    raw: raw.trim(),
    title: titleClean,
    artist: artistClean,
    note: artistInfo.note
  };
}

export function parseSongList(input: string): ParsedEntry[] {
  const text = input.trim();
  if (!text) return [];

  // Count quoted titles. If we find at least one quoted segment, treat the whole
  // input as quoted-title shape (handles both single-line and multi-line variants).
  const quoteMatches = [...text.matchAll(QUOTED_RE)];
  if (quoteMatches.length >= 1) {
    const entries: ParsedEntry[] = [];
    for (const m of quoteMatches) {
      const entry = makeEntry(m[1] ?? null, m[2] ?? null, m[0] ?? '');
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) return entries;
  }

  // Newline-delimited fallback. Each non-empty line is one query. We accept a
  // few common separators between title and artist (`—`, `–`, ` - `, ` by `).
  const entries: ParsedEntry[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // Split on em-dash, en-dash, ` - `, or ` by `, taking the first occurrence.
    const m = line.match(/^(.+?)\s+(?:—|–|-|by)\s+(.+)$/i);
    if (m) {
      const entry = makeEntry(m[1] ?? null, m[2] ?? null, line);
      if (entry) entries.push(entry);
    } else {
      // No separator we recognize: treat the whole line as the search query
      // (iTunes Search handles fuzzy title-artist queries well).
      const entry = makeEntry(line, null, line);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

/**
 * Resolve a batch of queries against iTunes Search with limited concurrency.
 * `searchOne` is passed in so this stays pure / testable.
 */
export async function resolveBatch<T>(
  entries: ParsedEntry[],
  searchOne: (query: string) => Promise<T | null>,
  concurrency = 4
): Promise<Array<{ entry: ParsedEntry; result: T | null; error: string | null }>> {
  const out: Array<{ entry: ParsedEntry; result: T | null; error: string | null }> = entries.map(
    (e) => ({ entry: e, result: null, error: null })
  );
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= entries.length) return;
      try {
        out[i]!.result = await searchOne(entries[i]!.query);
      } catch (err) {
        out[i]!.error = (err as Error).message;
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

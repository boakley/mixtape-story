export type SeedSong = {
  position: number;
  year: number | null;
  title: string;
  album: string | null;
  artist: string | null;
  link: string | null;
  story: string;
};

const FIELD_COUNT = 6;

export function parseSeedCsv(raw: string): SeedSong[] {
  const songs: SeedSong[] = [];
  let position = 1;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;

    const fields = splitFirstN(line, ',', FIELD_COUNT - 1);
    if (fields.length !== FIELD_COUNT) {
      console.warn(
        `[seed] skipping malformed row (expected ${FIELD_COUNT} fields, got ${fields.length}): ${trimmed}`
      );
      continue;
    }

    const [yearRaw, title, album, artist, link, story] = fields.map((f) => f.trim());

    if (!title || !story) {
      console.warn(`[seed] skipping row with empty title or story: ${trimmed}`);
      continue;
    }

    const year = yearRaw ? parseYear(yearRaw) : null;

    songs.push({
      position: position++,
      year,
      title,
      album: album || null,
      artist: artist || null,
      link: link || null,
      story
    });
  }

  return songs;
}

function splitFirstN(input: string, sep: string, max: number): string[] {
  const parts: string[] = [];
  let remaining = input;
  for (let i = 0; i < max; i++) {
    const idx = remaining.indexOf(sep);
    if (idx === -1) break;
    parts.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx + 1);
  }
  parts.push(remaining);
  return parts;
}

function parseYear(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 1000 && n < 9999 ? n : null;
}

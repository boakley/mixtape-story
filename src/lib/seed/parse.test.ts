import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSeedCsv } from './parse';

describe('parseSeedCsv', () => {
  beforeEach(() => {
    // Silence the warnings the parser emits for malformed or skipped
    // rows so they don't pollute test output. Tests that assert on the
    // warning use the spy directly.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns an empty array for empty input', () => {
    expect(parseSeedCsv('')).toEqual([]);
  });

  it('skips comment lines starting with #', () => {
    const input = `# year, song, album, artist, link, story
# header comment line
# another comment`;
    expect(parseSeedCsv(input)).toEqual([]);
  });

  it('skips blank lines', () => {
    expect(parseSeedCsv('\n\n   \n\n')).toEqual([]);
  });

  it('parses a single well-formed row', () => {
    const input = '1992, Black, Ten, Pearl Jam, https://song.link/i/123, A story about heartbreak.';
    const result = parseSeedCsv(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      position: 1,
      year: 1992,
      title: 'Black',
      album: 'Ten',
      artist: 'Pearl Jam',
      link: 'https://song.link/i/123',
      story: 'A story about heartbreak.'
    });
  });

  it('preserves commas inside the story field (splits on first 5 only)', () => {
    const input =
      '1992, Black, Ten, Pearl Jam, , Story with commas, semicolons; and dashes — yes really.';
    const result = parseSeedCsv(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.story).toBe(
      'Story with commas, semicolons; and dashes — yes really.'
    );
  });

  it('returns null for empty optional fields (album, artist, link)', () => {
    const input = '1992, Black, , , , A story.';
    const result = parseSeedCsv(input);
    expect(result[0]?.album).toBeNull();
    expect(result[0]?.artist).toBeNull();
    expect(result[0]?.link).toBeNull();
  });

  it('skips rows with an empty title', () => {
    const input = '1992, , Ten, Pearl Jam, https://song.link/i/123, A story.';
    const result = parseSeedCsv(input);
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('skips rows with an empty story', () => {
    const input = '1992, Black, Ten, Pearl Jam, https://song.link/i/123, ';
    const result = parseSeedCsv(input);
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null for an empty year', () => {
    const input = ', Black, Ten, Pearl Jam, , A story.';
    expect(parseSeedCsv(input)[0]?.year).toBeNull();
  });

  it('returns null for a non-numeric year', () => {
    const input = 'not-a-year, Black, Ten, Pearl Jam, , A story.';
    expect(parseSeedCsv(input)[0]?.year).toBeNull();
  });

  it('returns null for an out-of-range year', () => {
    expect(parseSeedCsv('500, Black, , , , Story.')[0]?.year).toBeNull();
    expect(parseSeedCsv('99999, Black, , , , Story.')[0]?.year).toBeNull();
  });

  it('accepts year boundaries 1001 and 9998', () => {
    expect(parseSeedCsv('1001, Black, , , , Story.')[0]?.year).toBe(1001);
    expect(parseSeedCsv('9998, Black, , , , Story.')[0]?.year).toBe(9998);
  });

  it('skips malformed rows (wrong field count) with a warning', () => {
    const input = '1992, Black, Ten'; // only three fields, not six
    const result = parseSeedCsv(input);
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('increments position across valid rows starting at 1', () => {
    const input = `1992, Black, Ten, Pearl Jam, , Story one.
1994, Doll Parts, Live Through This, Hole, , Story two.
1995, You Oughta Know, Jagged Little Pill, Alanis Morissette, , Story three.`;
    const result = parseSeedCsv(input);
    expect(result).toHaveLength(3);
    expect(result[0]?.position).toBe(1);
    expect(result[1]?.position).toBe(2);
    expect(result[2]?.position).toBe(3);
  });

  it('does not advance position for skipped rows', () => {
    const input = `1992, Black, Ten, Pearl Jam, , Story one.
1993, , , , ,
1995, You Oughta Know, Jagged Little Pill, Alanis Morissette, , Story three.`;
    const result = parseSeedCsv(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.position).toBe(1);
    expect(result[1]?.position).toBe(2);
  });

  it('trims whitespace from each field', () => {
    const input = '  1992  ,   Black   ,   Ten   ,   Pearl Jam   ,   https://song.link/i/123   ,   A story.  ';
    const result = parseSeedCsv(input);
    expect(result[0]?.year).toBe(1992);
    expect(result[0]?.title).toBe('Black');
    expect(result[0]?.album).toBe('Ten');
    expect(result[0]?.artist).toBe('Pearl Jam');
    expect(result[0]?.link).toBe('https://song.link/i/123');
    expect(result[0]?.story).toBe('A story.');
  });

  it('handles a mixed file of comments, blanks, and valid rows', () => {
    const input = `# year, song, album, artist, link, story
1992, Black, Ten, Pearl Jam, , Story one.

# section break
1994, Doll Parts, Live Through This, Hole, , Story two.`;
    const result = parseSeedCsv(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.position).toBe(1);
    expect(result[1]?.position).toBe(2);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { parseSongList, resolveBatch } from './parse-list';

describe('parseSongList', () => {
  describe('quoted-title shape', () => {
    it('parses a single quoted title with artist', () => {
      const result = parseSongList('"Angel from Montgomery" John Prine');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: 'Angel from Montgomery',
        artist: 'John Prine',
        query: 'Angel from Montgomery John Prine',
        note: null
      });
    });

    it('parses multiple quoted titles on a single line', () => {
      const result = parseSongList(
        '"Angel from Montgomery" John Prine "Beware of Darkness" George Harrison'
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        title: 'Angel from Montgomery',
        artist: 'John Prine'
      });
      expect(result[1]).toMatchObject({
        title: 'Beware of Darkness',
        artist: 'George Harrison'
      });
    });

    it('parses multiple quoted titles across multiple lines', () => {
      const input = `"Angel from Montgomery" John Prine
"Beware of Darkness" George Harrison`;
      const result = parseSongList(input);
      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[1]?.title).toBe('Beware of Darkness');
    });

    it('handles smart (curly) quotes', () => {
      const result = parseSongList('“Angel from Montgomery” John Prine');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[0]?.artist).toBe('John Prine');
    });

    it('parses a quoted title with no artist', () => {
      const result = parseSongList('"Heart of Gold"');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Heart of Gold');
      expect(result[0]?.artist).toBeNull();
      expect(result[0]?.query).toBe('Heart of Gold');
    });

    it('strips parenthetical annotation from artist and keeps it in note', () => {
      const result = parseSongList('"Angel from Montgomery" John Prine (Bonnie Raitt duet, preferred)');
      expect(result).toHaveLength(1);
      expect(result[0]?.artist).toBe('John Prine');
      expect(result[0]?.note).toBe('Bonnie Raitt duet, preferred');
      expect(result[0]?.query).toBe('Angel from Montgomery John Prine');
    });
  });

  describe('newline-delimited shape', () => {
    it('parses an em-dash separator', () => {
      const result = parseSongList('Angel from Montgomery — John Prine');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[0]?.artist).toBe('John Prine');
    });

    it('parses an en-dash separator', () => {
      const result = parseSongList('Angel from Montgomery – John Prine');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[0]?.artist).toBe('John Prine');
    });

    it('parses an ASCII hyphen separator', () => {
      const result = parseSongList('Angel from Montgomery - John Prine');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[0]?.artist).toBe('John Prine');
    });

    it('parses a " by " separator', () => {
      const result = parseSongList('Angel from Montgomery by John Prine');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[0]?.artist).toBe('John Prine');
    });

    it('treats lines without a recognized separator as whole-line queries', () => {
      const result = parseSongList('Just some search text');
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Just some search text');
      expect(result[0]?.artist).toBeNull();
      expect(result[0]?.query).toBe('Just some search text');
    });

    it('skips comment lines that start with #', () => {
      const input = `# my mixtape
Angel from Montgomery — John Prine
# section divider
Heart of Gold — Neil Young`;
      const result = parseSongList(input);
      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[1]?.title).toBe('Heart of Gold');
    });

    it('skips blank lines', () => {
      const input = `Angel from Montgomery — John Prine


Heart of Gold — Neil Young`;
      const result = parseSongList(input);
      expect(result).toHaveLength(2);
    });

    it('strips parenthetical annotation in newline-delimited shape', () => {
      const result = parseSongList('Angel from Montgomery — John Prine (Bonnie Raitt duet)');
      expect(result).toHaveLength(1);
      expect(result[0]?.artist).toBe('John Prine');
      expect(result[0]?.note).toBe('Bonnie Raitt duet');
    });

    it('preserves songwriter slashes in the artist field', () => {
      const result = parseSongList('Some Song — Lennon / McCartney');
      expect(result).toHaveLength(1);
      expect(result[0]?.artist).toBe('Lennon / McCartney');
    });
  });

  describe('edge cases', () => {
    it('returns an empty array for empty input', () => {
      expect(parseSongList('')).toEqual([]);
      expect(parseSongList('   \n  \n  ')).toEqual([]);
    });

    it('trims whitespace from fields', () => {
      const result = parseSongList('   Angel from Montgomery   —   John Prine   ');
      expect(result[0]?.title).toBe('Angel from Montgomery');
      expect(result[0]?.artist).toBe('John Prine');
    });
  });
});

describe('resolveBatch', () => {
  it('resolves each query through the provided searchOne', async () => {
    const entries = parseSongList(
      '"Heart of Gold" Neil Young\n"Angel from Montgomery" John Prine'
    );
    const searchOne = vi.fn(async (query: string) => `result-for-${query}`);
    const results = await resolveBatch(entries, searchOne);
    expect(results).toHaveLength(2);
    expect(results[0]?.result).toContain('Heart of Gold');
    expect(results[0]?.error).toBeNull();
    expect(results[1]?.result).toContain('Angel from Montgomery');
    expect(searchOne).toHaveBeenCalledTimes(2);
  });

  it('captures errors per entry without failing the whole batch', async () => {
    const entries = parseSongList('"Alpha" One\n"Beta" Two');
    const searchOne = vi.fn(async (query: string) => {
      if (query.includes('Alpha')) throw new Error('boom');
      return 'ok';
    });
    const results = await resolveBatch(entries, searchOne);
    expect(results).toHaveLength(2);
    expect(results[0]?.error).toBe('boom');
    expect(results[0]?.result).toBeNull();
    expect(results[1]?.error).toBeNull();
    expect(results[1]?.result).toBe('ok');
  });

  it('respects the concurrency limit', async () => {
    const entries = parseSongList('"A" 1\n"B" 2\n"C" 3\n"D" 4\n"E" 5');
    let active = 0;
    let maxActive = 0;
    const searchOne = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 'ok';
    });
    await resolveBatch(entries, searchOne, 2);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(searchOne).toHaveBeenCalledTimes(5);
  });

  it('returns one result per input entry, in order', async () => {
    const entries = parseSongList('"A" 1\n"B" 2\n"C" 3');
    const searchOne = async (query: string) => query;
    const results = await resolveBatch(entries, searchOne);
    expect(results).toHaveLength(3);
    expect(results[0]?.entry.title).toBe('A');
    expect(results[1]?.entry.title).toBe('B');
    expect(results[2]?.entry.title).toBe('C');
  });
});

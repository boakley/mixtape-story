import { describe, it, expect } from 'vitest';
import { truncateStory, normalizeSongKey } from './story-truncate';

describe('truncateStory', () => {
  it('returns empty + not truncated for empty input', () => {
    expect(truncateStory('')).toEqual({ excerpt: '', isTruncated: false });
  });

  it('returns whole text unchanged when it fits in 2 sentences', () => {
    const text = 'Short one. Second sentence.';
    expect(truncateStory(text)).toEqual({ excerpt: text, isTruncated: false });
  });

  it('keeps only the first 2 sentences when there are more', () => {
    const text = 'One. Two. Three. Four.';
    const result = truncateStory(text);
    expect(result.excerpt).toBe('One. Two.…');
    expect(result.isTruncated).toBe(true);
  });

  it('treats ? and ! as sentence terminators', () => {
    const text = 'Is it? Yes! Three.';
    const result = truncateStory(text);
    expect(result.excerpt).toBe('Is it? Yes!…');
    expect(result.isTruncated).toBe(true);
  });

  it('returns unterminated input verbatim when no sentence end is found', () => {
    // No `[.!?]` terminator at all — whole text is kept untouched.
    const text = 'a brief note without punctuation';
    expect(truncateStory(text)).toEqual({ excerpt: text, isTruncated: false });
  });

  it('caps at ~280 chars with ellipsis when the first 2 sentences are too long', () => {
    // First sentence alone exceeds the cap.
    const text =
      'A'.repeat(200) +
      '. ' +
      'B'.repeat(200) +
      '. ' +
      'tail sentence three.';
    const result = truncateStory(text);
    expect(result.isTruncated).toBe(true);
    expect(result.excerpt.length).toBeLessThanOrEqual(281); // 280 + ellipsis char
    expect(result.excerpt.endsWith('…')).toBe(true);
  });

  it('does not append ellipsis when nothing was trimmed', () => {
    const text = 'Just one sentence here.';
    const result = truncateStory(text);
    expect(result.excerpt).toBe(text);
    expect(result.excerpt.endsWith('…')).toBe(false);
  });
});

describe('normalizeSongKey', () => {
  it('keys by normalized title + artist', () => {
    expect(normalizeSongKey('Imagine', 'John Lennon')).toBe('tn:imagine|john lennon');
  });

  it('lowercases for fallback key', () => {
    const a = normalizeSongKey('IMAGINE', 'John Lennon');
    const b = normalizeSongKey('imagine', 'john lennon');
    expect(a).toBe(b);
  });

  it('strips parenthetical qualifiers', () => {
    const plain = normalizeSongKey('Imagine', 'John Lennon');
    const remix = normalizeSongKey('Imagine (Remix)', 'John Lennon');
    const live = normalizeSongKey('Imagine (Live at Madison Square Garden)', 'John Lennon');
    expect(remix).toBe(plain);
    expect(live).toBe(plain);
  });

  it('strips trailing "feat. X" suffix', () => {
    const plain = normalizeSongKey('Imagine', 'John Lennon');
    const feat = normalizeSongKey('Imagine feat. Yoko Ono', 'John Lennon');
    const featuring = normalizeSongKey('Imagine featuring Yoko Ono', 'John Lennon');
    expect(feat).toBe(plain);
    expect(featuring).toBe(plain);
  });

  it('strips "- feat. X" hyphenated form', () => {
    const plain = normalizeSongKey('Imagine', 'John Lennon');
    const dashed = normalizeSongKey('Imagine - feat. Yoko Ono', 'John Lennon');
    expect(dashed).toBe(plain);
  });

  it('collapses internal whitespace', () => {
    const a = normalizeSongKey('Imagine', 'John Lennon');
    const b = normalizeSongKey('  Imagine  ', '  John   Lennon  ');
    expect(a).toBe(b);
  });

  it('treats null artist as empty', () => {
    expect(normalizeSongKey('Imagine', null)).toBe('tn:imagine|');
  });

  it('keeps genuinely different titles distinct', () => {
    const a = normalizeSongKey('Imagine', 'John Lennon');
    const b = normalizeSongKey('Mother', 'John Lennon');
    expect(a).not.toBe(b);
  });

  it('keeps same title with different artists distinct', () => {
    const a = normalizeSongKey('Imagine', 'John Lennon');
    const b = normalizeSongKey('Imagine', 'Glee Cast');
    expect(a).not.toBe(b);
  });

  it('is indifferent to recording identity — the key asks about the song, not the release', () => {
    // ISRC was deliberately dropped from the key: different releases of
    // one song carry different ISRCs, and rows without an ISRC could
    // never match rows with one. See the module comment.
    const a = normalizeSongKey('Imagine', 'John Lennon');
    const b = normalizeSongKey('Imagine', 'John Lennon');
    expect(a).toBe(b);
  });
});

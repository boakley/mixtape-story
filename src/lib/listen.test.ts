import { describe, it, expect } from 'vitest';
import { listenHref, isListenPref } from './listen';
import type { DisplaySong } from './types';

function song(overrides: Partial<DisplaySong> = {}): DisplaySong {
  return {
    id: 's1',
    position: 1,
    title: 'Imagine',
    artist: 'John Lennon',
    album: null,
    releaseYear: 1971,
    memoryYear: null,
    albumArtUrl: null,
    songlinkUrl: 'https://song.link/imagine',
    linksByPlatform: null,
    previewUrl: null,
    linkStatus: 'done',
    storyText: '',
    storyHtml: '',
    ...overrides
  };
}

describe('listenHref', () => {
  it('returns the universal Odesli URL when no preference is set', () => {
    expect(listenHref(song(), null)).toBe('https://song.link/imagine');
  });

  it('returns null when no preference and no universal URL exists', () => {
    expect(listenHref(song({ songlinkUrl: null }), null)).toBeNull();
  });

  it('routes to the direct per-platform link when one exists', () => {
    const s = song({
      linksByPlatform: {
        appleMusic: { url: 'https://music.apple.com/imagine' }
      }
    });
    expect(listenHref(s, 'apple')).toBe('https://music.apple.com/imagine');
  });

  it('falls back to a service-side search URL when no direct link', () => {
    const href = listenHref(song(), 'spotify');
    expect(href).toContain('open.spotify.com/search/');
    expect(href).toContain(encodeURIComponent('Imagine John Lennon'));
  });

  it('YouTube falls back to YouTube Music search', () => {
    const href = listenHref(song(), 'youtube');
    expect(href).toContain('music.youtube.com/search');
  });

  it('search URL uses title only when artist is missing', () => {
    const href = listenHref(song({ artist: null }), 'apple');
    expect(href).toContain(encodeURIComponent('Imagine'));
    expect(href).not.toContain('John%20Lennon');
  });
});

describe('isListenPref', () => {
  it('accepts the three real preferences', () => {
    expect(isListenPref('apple')).toBe(true);
    expect(isListenPref('spotify')).toBe(true);
    expect(isListenPref('youtube')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isListenPref('tidal')).toBe(false);
    expect(isListenPref('')).toBe(false);
    expect(isListenPref(null)).toBe(false);
    expect(isListenPref(undefined)).toBe(false);
  });
});

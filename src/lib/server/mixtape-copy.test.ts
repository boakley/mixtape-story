import { describe, expect, it } from 'vitest';
import { cloneSongRows, cloneStoryRows } from './mixtape-copy';

// Pure builders behind "start this mixtape from a copy of another".
// The orchestrator (copyMixtapeInto) does the DB round trips; these
// shape the rows, so the copy semantics are pinned here: everything
// content-shaped survives, identity/timestamps don't, and stories
// follow their songs across the old→new id mapping.

const SOURCE_SONG = {
  id: 'song-1',
  owner_id: 'owner-a',
  mixtape_id: 'mixtape-src',
  position: 3,
  title: 'Born in the U.S.A.',
  artist: 'Bruce Springsteen',
  album: 'Born in the U.S.A.',
  release_year: 1984,
  memory_year: 1989,
  isrc: 'USSM18400339',
  album_art_url: 'https://example.com/art.jpg',
  preview_url: 'https://example.com/preview.m4a',
  source_url: 'https://music.apple.com/song/1',
  songlink_url: 'https://song.link/i/1',
  links_by_platform: { spotify: { url: 'https://open.spotify.com/track/1' } },
  link_status: 'done',
  added_at: '2026-05-18T16:27:52Z'
};

describe('cloneSongRows', () => {
  it('strips identity and timestamps, re-homes to the target mixtape', () => {
    const clone = cloneSongRows([SOURCE_SONG], {
      mixtapeId: 'mixtape-new',
      ownerId: 'owner-a'
    })[0]!;
    expect(clone).not.toHaveProperty('id');
    expect(clone).not.toHaveProperty('added_at');
    expect(clone.mixtape_id).toBe('mixtape-new');
    expect(clone.owner_id).toBe('owner-a');
  });

  it('preserves content, ordering, and resolver state', () => {
    const clone = cloneSongRows([SOURCE_SONG], {
      mixtapeId: 'mixtape-new',
      ownerId: 'owner-a'
    })[0]!;
    expect(clone.position).toBe(3);
    expect(clone.title).toBe('Born in the U.S.A.');
    expect(clone.artist).toBe('Bruce Springsteen');
    expect(clone.album).toBe('Born in the U.S.A.');
    expect(clone.release_year).toBe(1984);
    expect(clone.memory_year).toBe(1989);
    expect(clone.isrc).toBe('USSM18400339');
    expect(clone.album_art_url).toBe(SOURCE_SONG.album_art_url);
    expect(clone.preview_url).toBe(SOURCE_SONG.preview_url);
    expect(clone.source_url).toBe(SOURCE_SONG.source_url);
    expect(clone.songlink_url).toBe(SOURCE_SONG.songlink_url);
    expect(clone.links_by_platform).toEqual(SOURCE_SONG.links_by_platform);
    expect(clone.link_status).toBe('done');
  });

  it('clones every row in order', () => {
    const second = { ...SOURCE_SONG, id: 'song-2', position: 4, title: 'Purple Rain' };
    const clones = cloneSongRows([SOURCE_SONG, second], {
      mixtapeId: 'mixtape-new',
      ownerId: 'owner-a'
    });
    expect(clones.map((c) => c.title)).toEqual(['Born in the U.S.A.', 'Purple Rain']);
  });
});

describe('cloneStoryRows', () => {
  it('maps stories from old song ids to new ones, preserving text', () => {
    const rows = cloneStoryRows({ 'song-1': 'new-1' }, [
      { song_id: 'song-1', text: 'Dad played this every Saturday.' }
    ]);
    expect(rows).toEqual([{ song_id: 'new-1', text: 'Dad played this every Saturday.' }]);
  });

  it('preserves empty placeholder stories', () => {
    const rows = cloneStoryRows({ 'song-1': 'new-1' }, [{ song_id: 'song-1', text: '' }]);
    expect(rows).toEqual([{ song_id: 'new-1', text: '' }]);
  });

  it('drops stories whose song is not in the mapping', () => {
    const rows = cloneStoryRows({ 'song-1': 'new-1' }, [
      { song_id: 'song-1', text: 'kept' },
      { song_id: 'song-ghost', text: 'dropped' }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe('kept');
  });
});

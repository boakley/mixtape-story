// 05-viewer-opens-mixtape: an anonymous visitor opens someone else's
// /{handle} link and reads through it. The visitor isn't authenticated
// at all — we use the `visitor` fixture to get a clean browser context.

import { test, expect } from '../fixtures/test';

test(
  'an anonymous visitor opens a creator\'s mixtape',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
  // Set up the creator's mixtape with content.
  await creator.mixtape.addSongsByList([
    'Wish You Were Here - Pink Floyd',
    'Such Great Heights - The Postal Service'
  ]);

  // Anon visitor lands on the mixtape and sees the songs.
  await visitor.page.goto(`/${creator.handle}`);
  await expect(
    visitor.page.getByRole('heading', { name: `${creator.displayName}'s mixtape`, level: 1 })
  ).toBeVisible();
  await expect(visitor.page.getByText(/Wish You Were Here/i).first()).toBeVisible();
  await expect(visitor.page.getByText(/Such Great Heights/i).first()).toBeVisible();

  // A listen affordance is visible inside the song row. The exact
  // form depends on whether Odesli resolved by the time the test
  // runs: a `→ Listen` link (resolved or disabled-state), or the
  // 30-second `Preview` button when only the audio preview is
  // available. Either is a valid pass for "the visitor can act on
  // this song." Scoping to the article excludes the (hidden)
  // first-Listen modal's "Where do you listen?" heading.
  const firstSong = visitor.page.locator('article').first();
  await expect(firstSong.getByText(/listen|preview/i).first()).toBeVisible();
});

test(
  'the footer privacy link leads to a real privacy page',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    await visitor.page.goto(`/${creator.handle}`);
    await visitor.page.getByRole('link', { name: 'Privacy' }).click();
    await visitor.page.waitForURL('**/privacy');
    await expect(
      visitor.page.getByRole('heading', { name: 'Privacy', level: 1 })
    ).toBeVisible();
    // The page's load-bearing promise: a working deletion contact.
    await expect(
      visitor.page.getByRole('link', { name: 'bryan@mixtapestory.com' })
    ).toBeVisible();
  }
);

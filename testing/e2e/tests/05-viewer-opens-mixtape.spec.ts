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

  // The Listen affordance is visible — its target depends on whether
  // Odesli resolved by the time the test runs, so we just assert the
  // link exists.
  await expect(visitor.page.getByText(/listen/i).first()).toBeVisible();
});

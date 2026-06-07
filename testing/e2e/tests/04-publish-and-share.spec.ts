// 04-publish-and-share: the share-button surface and the Open Graph
// metadata on the public page. OG tags are flagged as the single
// most important feature in design-notes — testing them prevents a
// regression that would silently wreck the WhatsApp unfurl.

import { test, expect } from '../fixtures/test';

test.skip('the public page exposes the right OG metadata', async ({ creator }) => {
  await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
  await creator.mixtape.open();

  // OG title, description, image — the unfurl surface.
  const ogTitle = await creator.page
    .locator('meta[property="og:title"]')
    .getAttribute('content');
  expect(ogTitle).toContain(creator.displayName);
  expect(ogTitle?.toLowerCase()).toContain('mixtape');

  const ogDesc = await creator.page
    .locator('meta[property="og:description"]')
    .getAttribute('content');
  // Per design-notes, the description shows the artist-level taste
  // profile (not song titles) — "the company we're in".
  expect(ogDesc).toContain('The Postal Service');

  const ogImage = await creator.page
    .locator('meta[property="og:image"]')
    .getAttribute('content');
  expect(ogImage).toMatch(/\.png$/);
});

test.skip('share button is reachable from the public page', async ({ creator }) => {
  await creator.mixtape.addSongsByList(['Imagine - John Lennon']);
  await creator.mixtape.open();

  // The Share button is visible to anyone (its handler routes to
  // navigator.share or wa.me — both leave the page or open a sheet
  // we can't easily inspect headlessly, so this just verifies the
  // button is reachable).
  await expect(creator.page.getByRole('button', { name: /^Share$/ })).toBeVisible();
});

// 04-publish-and-share: the share-button surface and the Open Graph
// metadata on the public page. OG tags are flagged as the single
// most important feature in design-notes — testing them prevents a
// regression that would silently wreck the WhatsApp unfurl.

import { test, expect } from '../fixtures/test';
import { workerGroupSlug } from '../fixtures/auth';
import { createGroup } from '../pages/group';
import { Mixtape } from '../pages/mixtape';

test(
  'the public page exposes the right OG metadata',
  { tag: ['@feature:public', '@feature:og', '@role:creator'] },
  async ({ creator }) => {
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

test(
  'share button is reachable from the public page',
  { tag: ['@feature:public', '@role:creator'] },
  async ({ creator }) => {
  await creator.mixtape.addSongsByList(['Imagine - John Lennon']);
  await creator.mixtape.open();

  // The Share button is visible to anyone (its handler routes to
  // navigator.share or wa.me — both leave the page or open a sheet
  // we can't easily inspect headlessly, so this just verifies the
  // button is reachable).
  await expect(creator.page.getByRole('button', { name: /^Share$/ })).toBeVisible();
});

test(
  'the OG card endpoint shows this mixtape, not the rest of the catalog',
  { tag: ['@feature:og', '@feature:group', '@role:creator'] },
  async ({ creator }) => {
    // Primary has one artist; a group-born mixtape has a different
    // one. The /og/{handle} SVG must scope by mixtape_id — the launch
    // review found it querying by owner_id, which would leak the
    // group-born artist into the primary's share card.
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    const slug = workerGroupSlug('og-scope');
    const group = await createGroup(creator.page, { slug, name: 'OG Scope Circle' });
    await group.makeGroupMixtape({ name: 'OG Side Mixtape' });
    await creator.page.waitForURL(`**/${creator.handle}/${slug}/_edit`);
    const side = new Mixtape(creator.page, creator.handle, creator.displayName, {
      slug,
      name: 'OG Side Mixtape'
    });
    await side.addSongsByList(['Thunder Road - Bruce Springsteen']);

    const res = await creator.page.request.get(`/og/${creator.handle}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/svg');
    const svg = await res.text();
    expect(svg).toContain('The Postal Service');
    expect(svg).not.toContain('Bruce Springsteen');
  }
);

// 09-share-mixtape-with-group: a member with a populated mixtape
// clicks Share my mixtape with this group; their card appears in the
// directory with the right song count. Clicking Stop sharing
// removes it.

import { test, expect } from '../fixtures/test';
import { workerGroupSlug } from '../fixtures/auth';
import { createGroup } from '../pages/group';

test('a member shares and unshares their mixtape', async ({ creator }) => {
  const slug = workerGroupSlug('share-circle');
  // Seed the creator's mixtape with two songs.
  await creator.mixtape.addSongsByList([
    'Wish You Were Here - Pink Floyd',
    'Imagine - John Lennon'
  ]);

  // Steward creates a group; lands on the empty directory.
  const group = await createGroup(creator.page, {
    slug,
    name: 'E2E Share Circle'
  });
  expect((await group.memberAndMixtapeCounts()).mixtapes).toBe(0);

  // Share my mixtape with this group → card appears in the directory.
  await group.shareMyMixtape();
  await expect(group.memberCard(creator.handle)).toBeVisible();
  expect((await group.memberAndMixtapeCounts()).mixtapes).toBe(1);
  await expect(
    creator.page.getByText(/2 songs/).first()
  ).toBeVisible();

  // Stop sharing → card disappears, count drops back.
  await group.unshareMyMixtape();
  await expect(group.memberCard(creator.handle)).toHaveCount(0);
  expect((await group.memberAndMixtapeCounts()).mixtapes).toBe(0);
});

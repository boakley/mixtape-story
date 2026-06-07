// 07-create-group: the steward path. A creator visits /g/create,
// fills the form, lands on /g/{slug} as the steward of a new group.

import { test, expect } from '../fixtures/test';
import { createGroup } from '../pages/group';

test.skip('a creator creates a group and lands as steward', async ({ creator }) => {
  const group = await createGroup(creator.page, {
    slug: 'e2e-writing-circle',
    name: 'E2E Writing Circle',
    description: 'A small group sharing songs and the stories that explain them.'
  });

  // Step 1: the landing header reflects the new group.
  await expect(group.title()).toHaveText('E2E Writing Circle');

  // Step 2: the steward panel is visible to the creator.
  await expect(
    creator.page.getByRole('heading', { name: /steward · invite codes/i })
  ).toBeVisible();

  // Step 3: the meta line shows them as the only member with 0 mixtapes
  // (they haven't shared yet).
  const counts = await group.memberAndMixtapeCounts();
  expect(counts.members).toBe(1);
  expect(counts.mixtapes).toBe(0);
});

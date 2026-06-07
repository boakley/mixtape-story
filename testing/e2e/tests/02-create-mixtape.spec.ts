// 02-create-mixtape: a signed-in creator adds songs to their mixtape.
//
// The auth happens via the seeded-session fixture (proved real once
// in 01). This test focuses on the editor flow: paste a list of songs,
// resolve them via the Apple Music API (already wired), commit. The
// public page then renders them.

import { test, expect } from '../fixtures/test';

test.skip('a creator adds songs by pasting a list', async ({ creator }) => {
  // Step 1: start at the editor.
  await creator.mixtape.openEditor();
  await expect(creator.page.getByRole('heading', { name: /edit/i })).toBeVisible();

  // Step 2: paste a list of three songs and resolve.
  await creator.mixtape.addSongsByList([
    'Wish You Were Here - Pink Floyd',
    'Tangled Up In Blue - Bob Dylan',
    'Such Great Heights - The Postal Service'
  ]);

  // Step 3: the editor now shows the three song rows.
  await expect(creator.page.getByText(/Wish You Were Here/i).first()).toBeVisible();
  await expect(creator.page.getByText(/Tangled Up In Blue/i).first()).toBeVisible();
  await expect(creator.page.getByText(/Such Great Heights/i).first()).toBeVisible();

  // Step 4: the public page shows the right count.
  await creator.mixtape.open();
  expect(await creator.mixtape.songCount()).toBe(3);
});

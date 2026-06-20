// 19-reorder-songs: the editor's reordering. The product offers two
// reorder paths: drag-and-drop (svelte-dnd-action) for visual users
// and per-row Up/Down buttons for touch, accessibility, and anyone
// who'd rather tap than drag. The drag path is exercised in the
// browser by real users; the test exercises the button path because
// it's the deterministic one (one click = one POST, no animation
// timing to race). Testing the behavior, not the library — see
// TESTING.md "Philosophy" and "Third-party internals" for the
// underlying principle.

import { test, expect } from '../fixtures/test';
import { awaitHydrated } from '../helpers/hydration';
import { actAndExpectSuccess } from '../helpers/actions';

test(
  'a creator moves a song to the top and the order sticks',
  { tag: ['@feature:editor', '@role:creator'] },
  async ({ creator }) => {
    await creator.mixtape.addSongsByList([
      'Such Great Heights - The Postal Service',
      'Over and Out - Flim & The BBs',
      'Purple Rain - Prince'
    ]);

    await creator.mixtape.openEditor();
    await awaitHydrated(creator.page);

    const rows = creator.page.getByTestId('song-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Such Great Heights');

    // Move Purple Rain (row 3) to the top by clicking its Up button
    // twice. Each click triggers a `fetch('?/reorder', POST)` from
    // moveSong, so each click gets wrapped in actAndExpectSuccess to
    // wait for the server commit before the next interaction.
    const moveUp = (songTitle: string) =>
      creator.page.getByRole('button', { name: `Move ${songTitle} up` });

    await actAndExpectSuccess(creator.page, 'reorder', async () => {
      await moveUp('Purple Rain').click();
    });
    await expect(rows.nth(1)).toContainText('Purple Rain');

    await actAndExpectSuccess(creator.page, 'reorder', async () => {
      await moveUp('Purple Rain').click();
    });
    await expect(rows.nth(0)).toContainText('Purple Rain');

    // Up button on the now-first row should be disabled (nothing to
    // swap with above it).
    await expect(moveUp('Purple Rain')).toBeDisabled();

    // The order survives a hard reload that re-reads from the DB.
    await creator.page.reload();
    await awaitHydrated(creator.page);
    await expect(creator.page.getByTestId('song-row').nth(0)).toContainText('Purple Rain');
    await expect(creator.page.getByTestId('song-row').nth(2)).toContainText('Over and Out');

    // And the public page reads in the new order.
    await creator.mixtape.open();
    const titles = creator.page.locator('article');
    await expect(titles.nth(0)).toContainText('Purple Rain');
    await expect(titles.nth(2)).toContainText('Over and Out');
  }
);

// 19-reorder-songs: the editor's reordering. Zero coverage before
// this despite a known concurrency caveat on the reorder action —
// this pins the single-tab happy path via the keyboard interaction
// (lift, move, drop): order updates, survives a reload, and shows on
// the public page.

import { test, expect } from '../fixtures/test';
import { awaitHydrated } from '../helpers/hydration';

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

    // Reorder via the keyboard path (svelte-dnd-action: focus the
    // row, Enter lifts, arrows move, Enter drops). Deterministic where
    // synthetic mouse drags proved timing-sensitive (drag engaged but
    // the drop reverted) — and it covers the accessible reorder path,
    // which nothing else exercises.
    await rows.nth(2).focus();
    await creator.page.keyboard.press('Enter');
    await creator.page.keyboard.press('ArrowUp');
    await creator.page.keyboard.press('ArrowUp');
    await creator.page.keyboard.press('Enter');

    // Optimistic order in the editor…
    await expect(rows.nth(0)).toContainText('Purple Rain');

    // …persisted by the reorder action: a hard reload re-reads the DB.
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

// 13-first-listen: the chooser modal that pops on first Listen tap
// (and from the "Listen with" menu item). Picking a service writes
// the mxs_listen_pref cookie; the choice survives a reload and the
// query param is stripped so a refresh doesn't re-open the modal.
//
// We exercise the modal via the menu-triggered path (?listen=set) so
// the test doesn't depend on whether Odesli has resolved a song yet —
// the Listen-click interception uses the same modal and the same
// onPick callback, so this covers the meaningful state changes.

import { test, expect } from '../fixtures/test';

test(
  '"Listen with" chooser persists the visitor preference and strips the query',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);

    // ?listen=set pops the modal on load — the "Listen with" menu
    // item links here from the layout ☰.
    await visitor.page.goto(`/${creator.handle}?listen=set`);

    const dialog = visitor.page.getByRole('dialog', { name: /where do you listen/i });
    await expect(dialog).toBeVisible();

    // Pick a service. Modal closes; cookie is written; the query
    // param is stripped so a refresh doesn't reopen the modal.
    await visitor.page.getByRole('button', { name: 'Spotify' }).click();
    await expect(dialog).toBeHidden();
    await expect(visitor.page).toHaveURL(`/${creator.handle}`);

    const cookies = await visitor.page.context().cookies();
    const prefCookie = cookies.find((c) => c.name === 'mxs_listen_pref');
    expect(prefCookie?.value).toBe('spotify');

    // Reload without the query — the modal stays closed and the
    // cookie still reflects the choice.
    await visitor.page.reload();
    await expect(dialog).toBeHidden();
    const cookiesAfter = await visitor.page.context().cookies();
    expect(cookiesAfter.find((c) => c.name === 'mxs_listen_pref')?.value).toBe('spotify');
  }
);

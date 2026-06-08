// 13-first-listen: the chooser modal that pops on first Listen tap
// (and from the "Listen with" menu item). Picking a service writes
// the mxs_listen_pref cookie; the choice survives a reload and the
// next click routes directly to the deep link.

import { test, expect } from '../fixtures/test';
import { markAllSongsResolved } from '../fixtures/auth';

test(
  'first Listen click pops the chooser; picking a service opens the deep link; no re-prompt on reload',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    // Fake the resolver state so SongRow renders a real <a> link
    // rather than the disabled `→ Listen` span (the freshly-imported
    // song hasn't run through Odesli yet in test time).
    await markAllSongsResolved(creator.id);

    await visitor.page.goto(`/${creator.handle}`);
    // Wait for hydration: without it the Listen <a> may fire its
    // default navigation before SongRow's onclick handler attaches,
    // and we'd see a song.link page instead of the chooser modal.
    await visitor.page.waitForLoadState('networkidle');

    const dialog = visitor.page.getByRole('dialog', { name: /where do you listen/i });
    const listenLink = visitor.page
      .locator('article')
      .first()
      .getByRole('link', { name: /listen/i });

    // First click intercepts — the modal pops, the link does NOT
    // navigate yet (SongRow preventDefaults via onListenAttempt).
    await expect(dialog).toBeHidden();
    await listenLink.click();
    await expect(dialog).toBeVisible();

    // Pick Spotify — modal closes; the page calls window.open with
    // the per-service URL, which Playwright sees as a popup. Without
    // per-platform deep links populated the URL falls through to the
    // service's public search URL.
    const [popup] = await Promise.all([
      visitor.page.waitForEvent('popup'),
      visitor.page.getByRole('button', { name: 'Spotify' }).click()
    ]);
    await expect(dialog).toBeHidden();
    expect(popup.url()).toContain('spotify.com');
    await popup.close();

    // Cookie persisted.
    const cookies = await visitor.page.context().cookies();
    const prefCookie = cookies.find((c) => c.name === 'mxs_listen_pref');
    expect(prefCookie?.value).toBe('spotify');

    // Reload — next Listen click navigates directly, no modal.
    await visitor.page.reload();
    await visitor.page.waitForLoadState('networkidle');
    const [secondPopup] = await Promise.all([
      visitor.page.waitForEvent('popup'),
      visitor.page
        .locator('article')
        .first()
        .getByRole('link', { name: /listen/i })
        .click()
    ]);
    expect(secondPopup.url()).toContain('spotify.com');
    await secondPopup.close();
    await expect(dialog).toBeHidden();
  }
);

test(
  '"Listen with" menu item opens the chooser explicitly; strips the query on close',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);

    // ?listen=set is the URL the layout ☰ "Listen with…" item routes
    // to — same modal, just no pending song to open after picking.
    await visitor.page.goto(`/${creator.handle}?listen=set`);
    await visitor.page.waitForLoadState('networkidle');

    const dialog = visitor.page.getByRole('dialog', { name: /where do you listen/i });
    await expect(dialog).toBeVisible();

    await visitor.page.getByRole('button', { name: 'YouTube' }).click();
    await expect(dialog).toBeHidden();
    // Page strips ?listen=set so a refresh doesn't reopen.
    await expect(visitor.page).toHaveURL(`/${creator.handle}`);

    const cookies = await visitor.page.context().cookies();
    const prefCookie = cookies.find((c) => c.name === 'mxs_listen_pref');
    expect(prefCookie?.value).toBe('youtube');
  }
);

test(
  '"Other" persists explicitly as the no-service choice (no re-prompt)',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    await markAllSongsResolved(creator.id);

    await visitor.page.goto(`/${creator.handle}`);
    await visitor.page.waitForLoadState('networkidle');
    const dialog = visitor.page.getByRole('dialog', { name: /where do you listen/i });
    await visitor.page
      .locator('article')
      .first()
      .getByRole('link', { name: /listen/i })
      .click();
    await expect(dialog).toBeVisible();

    // "Other" picks the Odesli chooser explicitly. The page opens the
    // songlink_url in a new tab (just like a no-preference visitor),
    // and the cookie is written so we don't pop the modal next time.
    const [popup] = await Promise.all([
      visitor.page.waitForEvent('popup'),
      visitor.page.getByRole('button', { name: /other service/i }).click()
    ]);
    expect(popup.url()).toContain('song.link');
    await popup.close();
    await expect(dialog).toBeHidden();

    const cookies = await visitor.page.context().cookies();
    expect(cookies.find((c) => c.name === 'mxs_listen_pref')?.value).toBe('other');

    // Reload — Listen still routes through Odesli with no modal.
    await visitor.page.reload();
    await visitor.page.waitForLoadState('networkidle');
    const [reloadPopup] = await Promise.all([
      visitor.page.waitForEvent('popup'),
      visitor.page
        .locator('article')
        .first()
        .getByRole('link', { name: /listen/i })
        .click()
    ]);
    expect(reloadPopup.url()).toContain('song.link');
    await reloadPopup.close();
    await expect(dialog).toBeHidden();
  }
);

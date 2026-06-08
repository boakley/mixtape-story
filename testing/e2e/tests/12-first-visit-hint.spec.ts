// 12-first-visit-hint: a first-time visitor on a mixtape with at least
// one story sees the row auto-opened and a small accent line attached
// ("tap any song to read its story"). The hint dismisses on the first
// interaction and persists dismissed across reloads via localStorage.

import { test, expect } from '../fixtures/test';

test(
  'first-time visitor sees the auto-open + hint; interaction dismisses it; reload keeps it dismissed',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    // Seed: one song with a story so firstStoryIdx === 0.
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    await creator.mixtape.writeStory(
      1,
      'The summer I had nothing figured out and walked everywhere.'
    );

    // Fresh anonymous visitor — the `visitor` fixture opens a brand-new
    // browser context, so localStorage starts empty.
    await visitor.page.goto(`/${creator.handle}`);

    // The hint shows on first visit.
    const hint = visitor.page.getByTestId('first-visit-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(/tap any song to read its story/i);

    // The first story-bearing row auto-opens (text visible even though
    // view is the default compact).
    await expect(
      visitor.page.getByText(/summer I had nothing figured out/i)
    ).toBeVisible();

    // Interact: click the song's title row to toggle. That's enough to
    // dismiss the hint per the implementation-notes rule.
    await visitor.page
      .getByRole('button', { name: /Such Great Heights/i, expanded: true })
      .click();
    await expect(hint).toHaveCount(0);

    // Reload — the dismissed state survives because
    // `mixtapestory:hinted` is persisted in localStorage.
    await visitor.page.reload();
    await expect(visitor.page.getByTestId('first-visit-hint')).toHaveCount(0);
  }
);

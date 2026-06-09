// 15-form-helptips: every primary form in the app exposes a small
// `(?)` HelpTip next to each labelled field. The HelpTip mechanics
// (toggle open, Esc close, click-outside close, only-one-open) are
// already covered by spec 11 against the invite form; this spec is
// the *coverage* sweep — it walks the other forms and asserts the
// triggers + tooltip content land on each.

import { test, expect } from '../fixtures/test';
import { awaitHydrated } from '../helpers/hydration';

test(
  'login form: Email field has a HelpTip with descriptive text',
  { tag: ['@feature:auth', '@role:viewer'] },
  async ({ visitor }) => {
    await visitor.page.goto('/login');
    await awaitHydrated(visitor.page);

    const helpTrigger = visitor.page.getByRole('button', { name: 'Help: Email' });
    await expect(helpTrigger).toBeVisible();

    await helpTrigger.click();
    const tooltip = visitor.page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/one-time sign-in link/i);

    await visitor.page.keyboard.press('Escape');
    await expect(visitor.page.getByRole('tooltip')).toHaveCount(0);
  }
);

test(
  '/g/create: every field has a HelpTip',
  { tag: ['@feature:group', '@role:creator'] },
  async ({ creator }) => {
    await creator.page.goto('/g/create');
    await awaitHydrated(creator.page);

    // Presence: three HelpTip triggers in field order.
    await expect(creator.page.getByRole('button', { name: 'Help: URL slug' })).toBeVisible();
    await expect(creator.page.getByRole('button', { name: 'Help: Display name' })).toBeVisible();
    await expect(creator.page.getByRole('button', { name: 'Help: Description' })).toBeVisible();

    // Spot-check: opening one shows text and Esc closes it.
    await creator.page.getByRole('button', { name: 'Help: URL slug' }).click();
    await expect(creator.page.getByRole('tooltip')).toContainText(/url fragment/i);
    await creator.page.keyboard.press('Escape');
    await expect(creator.page.getByRole('tooltip')).toHaveCount(0);
  }
);

test(
  '/{handle}/edit: list/search/URL fall-throughs all have HelpTips',
  { tag: ['@feature:editor', '@role:creator'] },
  async ({ creator }) => {
    await creator.mixtape.openEditor();
    await awaitHydrated(creator.page);

    // Default mode: paste-list.
    const pasteHelp = creator.page.getByRole('button', { name: 'Help: Paste a list' });
    await expect(pasteHelp).toBeVisible();
    await pasteHelp.click();
    await expect(creator.page.getByRole('tooltip')).toContainText(/match each\s+line/i);
    await creator.page.keyboard.press('Escape');

    // Switch to Search mode.
    await creator.page.getByRole('button', { name: 'Search', exact: true }).click();
    const searchHelp = creator.page.getByRole('button', { name: 'Help: Search' });
    await expect(searchHelp).toBeVisible();
    await searchHelp.click();
    await expect(creator.page.getByRole('tooltip')).toContainText(/apple music catalog/i);
    await creator.page.keyboard.press('Escape');

    // Reveal the streaming-URL fallback.
    await creator.page.getByRole('button', { name: /have a streaming url/i }).click();
    const urlHelp = creator.page.getByRole('button', { name: 'Help: Streaming URL' });
    await expect(urlHelp).toBeVisible();
    await urlHelp.click();
    await expect(creator.page.getByRole('tooltip')).toContainText(/songlink|odesli|universal link/i);
    await creator.page.keyboard.press('Escape');
  }
);

test(
  '/{handle}/edit story editor: Memory year + Story have HelpTips',
  { tag: ['@feature:editor', '@role:creator'] },
  async ({ creator }) => {
    // Need a song first so the per-row Story button exists.
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    await awaitHydrated(creator.page);

    // Open the story editor for the first row.
    const row = creator.page.getByTestId('song-row').first();
    await row.getByRole('button', { name: /^Story✓?$/ }).click();

    const yearHelp = creator.page.getByRole('button', { name: 'Help: Memory year' });
    const storyHelp = creator.page.getByRole('button', { name: 'Help: Story' });
    await expect(yearHelp).toBeVisible();
    await expect(storyHelp).toBeVisible();

    await yearHelp.click();
    await expect(creator.page.getByRole('tooltip')).toContainText(/year you most associate/i);
    // Clicking the Story (?) closes the Year tooltip and opens the Story one —
    // only one tip is open at a time (HelpTip mechanics, asserted here for
    // the editor surface specifically).
    await storyHelp.click();
    await expect(creator.page.getByRole('tooltip')).toHaveCount(1);
    await expect(creator.page.getByRole('tooltip')).toContainText(/markdown is supported/i);
  }
);

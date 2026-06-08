import { expect, type Page, type Locator } from '@playwright/test';
import { awaitHydrated } from '../helpers/hydration';

// Domain-shaped interface to a group landing page.
// Methods read as what a steward or member does: mintInvite,
// shareMyMixtape, unshareMyMixtape.

export class Group {
  readonly page: Page;
  readonly slug: string;

  constructor(page: Page, slug: string) {
    this.page = page;
    this.slug = slug;
  }

  /** The group's display-name heading. */
  title(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** The "N members · M mixtapes" meta line on the landing. */
  async memberAndMixtapeCounts(): Promise<{ members: number; mixtapes: number }> {
    const meta = await this.page.getByTestId('group-meta').textContent();
    const m = meta?.match(/(\d+)\s+members?\s+·\s+(\d+)\s+mixtapes?/);
    if (!m) return { members: 0, mixtapes: 0 };
    return { members: Number(m[1]), mixtapes: Number(m[2]) };
  }

  /**
   * Click the "Share my mixtape with this group" button (visible to
   * members whose mixtape isn't already shared). Returns after the
   * action's reactive refresh.
   */
  async shareMyMixtape(): Promise<void> {
    // Form action via use:enhance — no hard nav, so `awaitHydrated`
    // would return instantly off the still-mounted layout. Wait on
    // the action's response instead, which fires only when the
    // server-side INSERT has committed.
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('shareWith') && r.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      this.page.getByRole('button', { name: /share my mixtape with this group/i }).click()
    ]);
  }

  /** Reverse of shareMyMixtape — hides the viewer's card from the directory. */
  async unshareMyMixtape(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('unshareFrom') && r.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      this.page
        .getByRole('button', { name: /stop sharing my mixtape with this group/i })
        .click()
    ]);
  }

  /**
   * Mint a new invite code via the steward panel and return its full URL.
   * Stewards only; throws if the panel isn't visible. Expands the
   * steward section first if it's collapsed (default state).
   */
  async mintInvite(code: string): Promise<string> {
    await this.expandStewardSection();
    await this.page.locator('input[name="code"]').fill(code);
    await this.page.getByRole('button', { name: /mint invite/i }).click();
    // The new row carries data-invite-code on the <li> and a nested
    // data-testid="invite-url" on the URL paragraph.
    const row = this.page.locator(`[data-testid="invite-row"][data-invite-code="${code}"]`);
    await row.waitFor({ state: 'visible' });
    const url = await row.getByTestId('invite-url').textContent();
    if (!url) throw new Error('Could not read invite URL from new row');
    return url.trim();
  }

  /** Locator for a member mixtape card by handle. */
  memberCard(handle: string): Locator {
    return this.page.locator(`[data-testid="member-card"][data-handle="${handle}"]`);
  }

  // ── Tabs ────────────────────────────────────────────────────────────

  /** The named tab in the group view tablist. */
  tab(name: 'Member mixtapes' | 'Songs we share' | 'All songs'): Locator {
    return this.page.getByRole('tab', { name });
  }

  /** Click a tab. Awaits the localStorage write side effect by a tiny tick. */
  async switchTab(name: 'Member mixtapes' | 'Songs we share' | 'All songs'): Promise<void> {
    await this.tab(name).click();
  }

  /** Name of the currently-selected tab (the one with aria-selected="true"). */
  async activeTabName(): Promise<string | null> {
    const names: Array<'Member mixtapes' | 'Songs we share' | 'All songs'> = [
      'Member mixtapes',
      'Songs we share',
      'All songs'
    ];
    for (const n of names) {
      if ((await this.tab(n).getAttribute('aria-selected')) === 'true') return n;
    }
    return null;
  }

  // ── View toggle (visible on Songs we share + All songs) ────────────

  /** The Expanded/Compact pill container's two buttons. */
  viewButton(name: 'Expanded' | 'Compact'): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async setView(view: 'expanded' | 'compact'): Promise<void> {
    await this.viewButton(view === 'expanded' ? 'Expanded' : 'Compact').click();
  }

  // ── Song rows ──────────────────────────────────────────────────────

  /** Locator for a song entry by its title (works in either view). */
  songRow(title: string): Locator {
    return this.page.locator(`[data-testid="song-entry"][data-song-title="${title}"]`);
  }

  /** Click a compact-mode song to toggle its stories visible. */
  async expandSongInCompact(title: string): Promise<void> {
    const row = this.songRow(title);
    // The clickable trigger in compact mode is the button wrapping the
    // title (it has aria-expanded). Scope by title to disambiguate.
    await row.getByRole('button', { expanded: false }).first().click();
  }

  /** Locator for the [more]/[less] toggle inside a song's story body. */
  storyMoreToggle(title: string): Locator {
    return this.songRow(title).getByRole('button', { name: /\[(more|less)\]/i });
  }

  // ── Steward section collapse ────────────────────────────────────────

  /** The collapsible steward-section header button. */
  stewardSectionToggle(): Locator {
    return this.page.getByRole('button', { name: /^Steward · /i });
  }

  /** The body region (form + invites list) inside the collapsible section. */
  stewardSectionBody(): Locator {
    return this.page.locator('#steward-section-body');
  }

  async expandStewardSection(): Promise<void> {
    const toggle = this.stewardSectionToggle();
    await toggle.waitFor({ state: 'visible' });
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
      await this.stewardSectionBody().waitFor({ state: 'visible' });
    }
  }

  async collapseStewardSection(): Promise<void> {
    const toggle = this.stewardSectionToggle();
    if ((await toggle.getAttribute('aria-expanded')) === 'true') {
      await toggle.click();
    }
  }

  // ── Inline name + description editing ──────────────────────────────

  async editName(newName: string): Promise<void> {
    await this.page.getByRole('button', { name: /edit group name/i }).click();
    // The input is sr-only-labeled "Group name" by InlineEdit — refactor-
    // resilient: no hardcoded id selector to break if the component's
    // field-id convention changes.
    await this.page.getByLabel('Group name').fill(newName);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    // The form is dismissed and the <h1> reappears with the new name —
    // wait for that as the success signal.
    await this.page.getByRole('heading', { level: 1, name: newName }).waitFor();
  }

  async editDescription(newDescription: string): Promise<void> {
    await this.page.getByRole('button', { name: /edit description/i }).click();
    await this.page.getByLabel('Group description').fill(newDescription);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await this.page.getByText(newDescription, { exact: false }).first().waitFor();
  }

  // ── HelpTip (?) ─────────────────────────────────────────────────────

  /** Click a HelpTip by its labelled trigger ("Help: {label}"). */
  async openHelpTip(label: string): Promise<void> {
    await this.page.getByRole('button', { name: `Help: ${label}` }).click();
  }

  /** The currently-open tooltip body (only one is open at a time). */
  openTooltip(): Locator {
    return this.page.getByRole('tooltip');
  }
}

/**
 * Visit `/g/create` and create a group as the currently-authenticated
 * user. Returns a Group page object pointing at the new landing.
 */
export async function createGroup(
  page: Page,
  opts: { slug: string; name: string; description?: string }
): Promise<Group> {
  await page.goto('/g/create');
  // Wait for hydration — fill before the client takes over can race
  // with Svelte's `value={form?.slug ?? ''}` reactive binding.
  await awaitHydrated(page);

  const slug = page.locator('input[name="slug"]');
  await slug.click();
  await slug.pressSequentially(opts.slug, { delay: 10 });
  await expect(slug).toHaveValue(opts.slug);

  await page.locator('input[name="name"]').fill(opts.name);
  if (opts.description) {
    await page.locator('textarea[name="description"]').fill(opts.description);
  }

  // Wait for the form-action response so the test fails fast and
  // informatively if the action errors instead of timing out on
  // waitForURL.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/g/create') && r.request().method() === 'POST',
      { timeout: 15_000 }
    ),
    page.getByRole('button', { name: /create group/i }).click()
  ]);
  if (!response.ok() && response.status() !== 303) {
    throw new Error(`createGroup form action failed: ${response.status()}`);
  }
  await page.waitForURL(`**/g/${opts.slug}`);
  return new Group(page, opts.slug);
}

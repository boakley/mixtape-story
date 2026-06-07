import { expect, type Page, type Locator } from '@playwright/test';

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
    await this.page.getByRole('button', { name: /share my mixtape with this group/i }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Reverse of shareMyMixtape — hides the viewer's card from the directory. */
  async unshareMyMixtape(): Promise<void> {
    await this.page
      .getByRole('button', { name: /stop sharing my mixtape with this group/i })
      .click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Mint a new invite code via the steward panel and return its full URL.
   * Stewards only; throws if the panel isn't visible.
   */
  async mintInvite(code: string): Promise<string> {
    const panel = this.page.getByRole('heading', { name: /steward · invite codes/i });
    await panel.waitFor({ state: 'visible' });
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
  await page.waitForLoadState('networkidle');

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

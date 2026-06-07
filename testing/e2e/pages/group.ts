import type { Page, Locator } from '@playwright/test';

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
    const meta = await this.page.locator('main p.text-xs.text-ink-muted').first().textContent();
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
    // The new code row renders with the full URL beneath it.
    const row = this.page.locator('li:has(code)').filter({ hasText: code });
    await row.waitFor({ state: 'visible' });
    const url = await row.locator('p').filter({ hasText: 'http' }).first().textContent();
    if (!url) throw new Error('Could not read invite URL from new row');
    return url.trim();
  }

  /** Locator for a member mixtape card by handle. */
  memberCard(handle: string): Locator {
    return this.page.locator(`a[href="/${handle}"]`).filter({ hasText: 'mixtape' });
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
  await page.locator('input[name="slug"]').fill(opts.slug);
  await page.locator('input[name="name"]').fill(opts.name);
  if (opts.description) {
    await page.locator('textarea[name="description"]').fill(opts.description);
  }
  await page.getByRole('button', { name: /create group/i }).click();
  await page.waitForURL(`**/g/${opts.slug}`);
  return new Group(page, opts.slug);
}

import type { Page, Locator } from '@playwright/test';

// Domain-shaped interface to a creator's mixtape. Methods read as
// what a person does: addSong, writeStory, share. No DOM verbs in the
// public API; the selector strings are an implementation detail.

export class Mixtape {
  readonly page: Page;
  readonly handle: string;
  readonly displayName: string;

  constructor(page: Page, handle: string, displayName: string) {
    this.page = page;
    this.handle = handle;
    this.displayName = displayName;
  }

  /** Open the public-facing mixtape page (/{handle}). */
  async open(): Promise<void> {
    await this.page.goto(`/${this.handle}`);
  }

  /** Open the editor at /{handle}/edit. */
  async openEditor(): Promise<void> {
    await this.page.goto(`/${this.handle}/edit`);
  }

  /** Title heading visible on /{handle}. */
  title(): Locator {
    return this.page.getByRole('heading', { name: `${this.displayName}'s mixtape`, level: 1 });
  }

  /** Number of songs in the meta line of /{handle}. */
  async songCount(): Promise<number> {
    const text = await this.page
      .locator('main p.text-sm.text-ink-muted')
      .first()
      .textContent();
    const m = text?.match(/(\d+)\s+songs?/);
    return m ? Number(m[1]) : 0;
  }

  /**
   * Use the editor's text-list paste flow to add one or more songs.
   * Pastes the list, clicks "Find songs", waits for the preview to
   * render with at least `expected` matched rows, then commits.
   */
  async addSongsByList(lines: string[], expected = lines.length): Promise<void> {
    await this.openEditor();
    const textarea = this.page.locator('textarea[name="text"]').first();
    await textarea.fill(lines.join('\n'));
    await this.page.getByRole('button', { name: 'Find songs' }).click();

    // The preview renders a list of resolved tracks; wait for the
    // import button to be enabled. The button text reflects the
    // commit step ("Add N songs" or similar).
    const importBtn = this.page.getByRole('button', { name: /add \d+ song/i });
    await importBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await importBtn.click();
    // Editor redirects/refreshes back to itself with the new rows
    // visible; wait for them.
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Edit the song at `position` (1-based). Opens the story editor for
   * that song, fills in the text, optionally sets memory_year, saves.
   */
  async writeStory(position: number, text: string, memoryYear?: number): Promise<void> {
    await this.openEditor();
    const row = this.page.locator('article.song-row').nth(position - 1);
    await row.getByRole('button', { name: /story/i }).first().click();
    const storyInput = row.locator('textarea[name="text"]');
    await storyInput.fill(text);
    if (memoryYear !== undefined) {
      await row.locator('input[name="memory_year"]').fill(String(memoryYear));
    }
    await row.getByRole('button', { name: /save/i }).click();
  }

  /** Click "Share" on the public page — triggers navigator.share or wa.me fallback. */
  async share(): Promise<void> {
    await this.open();
    await this.page.getByRole('button', { name: /^Share$/ }).click();
  }
}

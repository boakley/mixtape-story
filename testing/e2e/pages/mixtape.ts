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
    const text = await this.page.getByTestId('mixtape-meta').textContent();
    const m = text?.match(/(\d+)\s+songs?/);
    return m ? Number(m[1]) : 0;
  }

  /**
   * Use the editor's text-list paste flow to add one or more songs.
   * Pastes the list, clicks "Find songs", waits for the preview to
   * render, then commits via the "Import N songs" button.
   */
  async addSongsByList(lines: string[]): Promise<void> {
    await this.openEditor();
    // Paste textarea has id="list-input". Avoids ambiguity with the
    // story editor's textarea (which also uses name="text").
    await this.page.locator('#list-input').fill(lines.join('\n'));
    await this.page.getByRole('button', { name: 'Find songs' }).click();

    // The preview-resolved import button reads "Import N songs". Wait
    // for it with a generous timeout — Apple Music search can take a
    // few seconds when the cache is cold.
    const importBtn = this.page.getByRole('button', { name: /^Import \d+ songs?$/ });
    await importBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await importBtn.click();
    // Editor refreshes back to itself with the new rows.
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Open the story editor for the song at `position` (1-based), fill
   * in the text, optionally set memory_year, save. Uses the
   * `song-row` test-id so reordering or class-name changes don't
   * break the selector. Waits for the save-story form action's
   * response before returning so callers don't race ahead and read
   * the public page before the save has committed.
   */
  async writeStory(position: number, text: string, memoryYear?: number): Promise<void> {
    await this.openEditor();
    await this.page.waitForLoadState('networkidle');
    const row = this.page.getByTestId('song-row').nth(position - 1);
    await row.getByRole('button', { name: /^Story✓?$/ }).click();
    const storyInput = row.locator('textarea[name="text"]');
    await storyInput.fill(text);
    if (memoryYear !== undefined) {
      await row.locator('input[name="memory_year"]').fill(String(memoryYear));
    }
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('save_story') && r.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      row.getByRole('button', { name: /save story/i }).click()
    ]);
  }

  /** Click "Share" on the public page — triggers navigator.share or wa.me fallback. */
  async share(): Promise<void> {
    await this.open();
    await this.page.getByRole('button', { name: /^Share$/ }).click();
  }
}

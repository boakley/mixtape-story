// Hydration helper for E2E tests.
//
// SvelteKit renders the page on the server, ships HTML to the
// browser, and only then runs the JS that wires up event handlers.
// A Playwright click that lands in that window hits the bare HTML
// — a `<button>` does nothing, an `<a target="_blank">` follows
// its href in a new tab — and the test sees a no-op or an
// unexpected navigation.
//
// `+layout.svelte` runs an $effect on mount that sets
// `body[data-hydrated="true"]`. Children mount before parents in
// Svelte, so by the time that effect fires, every SongRow / form /
// modal trigger on the page already has its onclick bound. Tests
// call `awaitHydrated(page)` after a goto/reload/submit to fence
// the click behind the marker.
//
// Replaces the older `page.waitForLoadState('networkidle')` pattern,
// which Playwright marks as discouraged (slow on real apps, not
// actually a hydration signal).
//
// IMPORTANT: only use this after a hard navigation (`page.goto`,
// `page.reload`, magic-link follow). SvelteKit form actions via
// `use:enhance` re-run the page's `load()` in place without
// remounting the layout, so the marker is still "true" from the
// previous render — `awaitHydrated` returns instantly and the test
// races ahead of the action. For form actions, await the form's
// POST response via `page.waitForResponse` instead.

import type { Page } from '@playwright/test';

export async function awaitHydrated(page: Page): Promise<void> {
  await page.locator('body[data-hydrated="true"]').waitFor();
}

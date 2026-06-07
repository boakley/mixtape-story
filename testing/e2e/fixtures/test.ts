// Custom test fixtures. Import `test` and `expect` from here in spec
// files instead of from '@playwright/test' so the seeded-session
// fixture is wired up.
//
// Per TESTING.md: page objects speak the product's vocabulary; tests
// read as sentences in that vocabulary. The `creator` fixture is the
// authenticated entry point for journeys that aren't about sign-in.

import { test as base, expect, type Page } from '@playwright/test';
import { seedUser, wipeTestData, type SeededUser } from './auth';
import { clearInbox } from './mailpit';
import { Mixtape } from '../pages/mixtape';
import { Group } from '../pages/group';

type Creator = SeededUser & {
  page: Page;
  mixtape: Mixtape;
  /** Browse to the group with the given slug, returning a Group page object. */
  visitGroup: (slug: string) => Promise<Group>;
};

type Fixtures = {
  creator: Creator;
  /** A second seeded user (handle 'tim'), unauthenticated, useful for
   *  multi-actor journeys (invite + join, viewer-opens-mixtape). */
  visitor: { page: Page };
};

export const test = base.extend<Fixtures>({
  creator: async ({ browser }, use) => {
    const seeded = await seedUser({ handle: 'sam', displayName: 'Sam' });

    // Open a fresh context, navigate to the session URL to set the
    // auth cookie, then hand the test a page that's already signed in.
    const context = await browser.newContext();
    const page = await context.newPage();

    // Supabase's action_link points to the auth callback with a code;
    // navigating it sets the session cookie. We end up on /me by
    // default, but the test will navigate where it needs to.
    await page.goto(seeded.sessionUrl);
    await page.waitForURL((url) => !url.toString().includes('/auth/'), { timeout: 10_000 });

    const mixtape = new Mixtape(page, seeded.handle, seeded.displayName);

    await use({
      ...seeded,
      page,
      mixtape,
      visitGroup: async (slug: string) => {
        await page.goto(`/g/${slug}`);
        return new Group(page, slug);
      }
    });

    await context.close();
  },

  visitor: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use({ page });
    await context.close();
  }
});

// Wipe test data + the Mailpit inbox before each test so journeys
// start from a known clean slate. Failures here would obscure the
// real test failure, so any error is surfaced explicitly.
test.beforeEach(async () => {
  await wipeTestData();
  await clearInbox();
});

export { expect };

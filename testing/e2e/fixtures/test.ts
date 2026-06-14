// Custom test fixtures. Import `test` and `expect` from here in spec
// files instead of from '@playwright/test' so the seeded-session
// fixture is wired up.
//
// Per TESTING.md: page objects speak the product's vocabulary; tests
// read as sentences in that vocabulary. The `creator` fixture is the
// authenticated entry point for journeys that aren't about sign-in.

import { test as base, expect, type Page } from '@playwright/test';
import { seedUser, wipeTestData, type SeededUser } from './auth';
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
  /** A second seeded user (handle 'roxanne'), unauthenticated, useful for
   *  multi-actor journeys (invite + join, viewer-opens-mixtape). */
  visitor: { page: Page };
};

export const test = base.extend<Fixtures>({
  creator: async ({ browser }, use) => {
    // Wipe inline so cleanup happens immediately before the seed.
    // Worker-scoped: each parallel worker only touches its own
    // `*-w{idx}` namespace, so siblings don't trample each other.
    // Idempotent: harmless to call even when there's nothing to clean.
    // Inbox isn't cleared — emails are uniquely-keyed by timestamp and
    // Mailpit search filters by `to:email`, so cross-worker emails
    // don't collide.
    await wipeTestData();

    const seeded = await seedUser({ baseHandle: 'sam', displayName: 'Sam' });

    // Open a fresh context, sign in via the test-only /api/test/session
    // endpoint (which calls signInWithPassword through the SvelteKit
    // SSR Supabase client, setting the right cookies on the browser
    // context), then hand the test a page that's already signed in.
    const context = await browser.newContext();
    const page = await context.newPage();

    const res = await page.request.post('/api/test/session', {
      data: { email: seeded.email, password: seeded.password }
    });
    if (!res.ok()) {
      throw new Error(`Could not sign in seeded user: ${res.status()} ${await res.text()}`);
    }

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

export { expect };

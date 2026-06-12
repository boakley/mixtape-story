// 20-admin-pages: the operator's journey. These pages shipped a real
// 404 (the groups "All" filter tab resolved to /admin) because no
// spec ever clicked them — this is that regression's net, plus the
// admin gate itself. Admin access comes from the ADMIN_EMAILS
// wildcard (*@e2e-admin.local) in dev env; see src/lib/server/admin.ts.

import { test, expect } from '../fixtures/test';
import { seedUser, wipeTestData, workerGroupSlug } from '../fixtures/auth';
import { createGroup } from '../pages/group';

test(
  'a non-admin gets 404s on every admin page',
  { tag: ['@feature:admin', '@role:creator'] },
  async ({ creator }) => {
    for (const path of ['/admin/groups', '/admin/mixtapes', '/admin/queue']) {
      const res = await creator.page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  }
);

test(
  'an admin walks the admin pages; the groups filter tabs all stay on the page',
  { tag: ['@feature:admin', '@role:creator'] },
  async ({ browser }) => {
    await wipeTestData();
    const admin = await seedUser({
      baseHandle: 'boss',
      displayName: 'Boss',
      emailDomain: 'e2e-admin.local'
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    const res = await page.request.post('/api/test/session', {
      data: { email: admin.email, password: admin.password }
    });
    if (!res.ok()) throw new Error(`admin sign-in failed: ${res.status()}`);

    // Seed one group so the lists have a row.
    const slug = workerGroupSlug('adminview');
    await createGroup(page, { slug, name: 'Admin View Circle' });

    // /admin/groups: the filter pills — including the All tab that
    // once linked to /admin and 404ed.
    await page.goto('/admin/groups');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/groups/i);
    for (const name of [/^Active/, /^Empty/, /^All/]) {
      await page.getByRole('link', { name }).click();
      await expect(page).toHaveURL(/\/admin\/groups/);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/groups/i);
    }
    // .first(): the admin table lists every worker's groups, and a
    // sibling worker may have a same-named leftover.
    await expect(page.getByText('Admin View Circle').first()).toBeVisible();

    // /admin/mixtapes: renders, and its filter tabs hold the page too.
    await page.goto('/admin/mixtapes');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/mixtapes/i);
    await page.getByRole('link', { name: /^All/ }).click();
    await expect(page).toHaveURL(/\/admin\/mixtapes/);

    // /admin/queue renders.
    await page.goto('/admin/queue');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/queue/i);

    await context.close();
  }
);

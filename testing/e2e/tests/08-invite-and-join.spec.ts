// 08-invite-and-join: the steward mints an invite code; a brand-new
// visitor follows the URL, signs up via magic link, lands in /g/{slug}
// as a member.
//
// This is the most journey-shaped of the group specs — it spans two
// browser contexts (steward + visitor) and the real magic-link path.

import { test, expect } from '../fixtures/test';
import { workerGroupSlug, workerHandle } from '../fixtures/auth';
import { createGroup } from '../pages/group';
import { fetchMagicLinkFor } from '../fixtures/mailpit';
import { awaitHydrated } from '../helpers/hydration';

test(
  'a steward invites someone; the invitee joins via magic link',
  {
    tag: [
      '@feature:group',
      '@feature:invite',
      '@feature:auth',
      '@role:steward',
      '@role:new-user'
    ]
  },
  async ({ creator, visitor }) => {
  const slug = workerGroupSlug('spring-cohort');
  const code = workerGroupSlug('spring2026'); // same naming pattern works for codes
  const timHandle = workerHandle('tim');

  // Steward sets up the group and mints an invite.
  const group = await createGroup(creator.page, {
    slug,
    name: 'E2E Spring Cohort'
  });
  const inviteUrl = await group.mintInvite(code);
  expect(inviteUrl).toContain(`/g/${slug}/i/${code}`);

  // Visitor (anon) opens the invite URL — they see the welcome page.
  await visitor.page.goto(inviteUrl);
  await expect(
    visitor.page.getByRole('heading', { name: /you've been invited to e2e spring cohort/i })
  ).toBeVisible();

  // Visitor enters email and submits.
  const email = `joiner-${Date.now()}@e2e.local`;
  // Wait for the invite page to hydrate before submitting — without
  // this, the form posts before use:enhance is wired up and the
  // response-wait predicate misses it.
  await awaitHydrated(visitor.page);
  await visitor.page.locator('input[name="email"]').fill(email);
  await Promise.all([
    visitor.page.waitForResponse(
      (r) => r.url().includes('/i/') && r.request().method() === 'POST',
      { timeout: 30_000 }
    ),
    visitor.page.getByRole('button', { name: /send me a link/i }).click()
  ]);
  await expect(visitor.page.getByText(/check.*for the magic link/i)).toBeVisible();

  // Magic link arrives in Mailpit; visitor follows it. Lands at the
  // invite URL again, now signed in but without a profile → bounces
  // through /onboarding with redirect=back-to-invite.
  const link = await fetchMagicLinkFor(email);
  await visitor.page.goto(link);
  await expect(visitor.page).toHaveURL(/\/onboarding/);

  // Visitor picks a handle. Onboarding honors the redirect param and
  // sends them back to the invite URL → membership is inserted →
  // landing renders with `?joined=1`.
  await visitor.page.locator('input[name="handle"]').fill(timHandle);
  await visitor.page.locator('input[name="display_name"]').fill('Tim');
  await visitor.page.getByRole('button', { name: /claim/i }).click();
  await visitor.page.waitForURL(new RegExp(`/g/${slug}`));

  // Visitor is now a member; counts reflect that.
  const visitorGroup = await creator.visitGroup(slug);
  const counts = await visitorGroup.memberAndMixtapeCounts();
  expect(counts.members).toBe(2);
});

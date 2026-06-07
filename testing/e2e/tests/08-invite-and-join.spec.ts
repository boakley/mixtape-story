// 08-invite-and-join: the steward mints an invite code; a brand-new
// visitor follows the URL, signs up via magic link, lands in /g/{slug}
// as a member.
//
// This is the most journey-shaped of the group specs — it spans two
// browser contexts (steward + visitor) and the real magic-link path.

import { test, expect } from '../fixtures/test';
import { createGroup } from '../pages/group';
import { fetchMagicLinkFor } from '../fixtures/mailpit';

test.skip('a steward invites someone; the invitee joins via magic link', async ({ creator, visitor }) => {
  // Steward sets up the group and mints an invite.
  const group = await createGroup(creator.page, {
    slug: 'e2e-spring-cohort',
    name: 'E2E Spring Cohort'
  });
  const inviteUrl = await group.mintInvite('e2e-spring2026');
  expect(inviteUrl).toContain('/g/e2e-spring-cohort/i/e2e-spring2026');

  // Visitor (anon) opens the invite URL — they see the welcome page.
  await visitor.page.goto(inviteUrl);
  await expect(
    visitor.page.getByRole('heading', { name: /you've been invited to e2e spring cohort/i })
  ).toBeVisible();

  // Visitor enters email and submits.
  const email = `joiner-${Date.now()}@e2e.local`;
  await visitor.page.locator('input[name="email"]').fill(email);
  await visitor.page.getByRole('button', { name: /send me a link/i }).click();
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
  await visitor.page.locator('input[name="handle"]').fill('tim');
  await visitor.page.locator('input[name="display_name"]').fill('Tim');
  await visitor.page.getByRole('button', { name: /claim/i }).click();
  await visitor.page.waitForURL(/\/g\/e2e-spring-cohort/);

  // Visitor is now a member; counts reflect that.
  await visitor.page.goto('/g/e2e-spring-cohort');
  const visitorGroup = await creator.visitGroup('e2e-spring-cohort');
  const counts = await visitorGroup.memberAndMixtapeCounts();
  expect(counts.members).toBe(2);
});

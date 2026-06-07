// 01-sign-in: the real magic-link path, exercised once.
//
// Every other journey starts already authenticated via the seeded-
// session fixture. This is the test that proves auth genuinely works
// end-to-end against the local stack: type email → wait for the
// magic link in Mailpit → follow it → land on /onboarding (or /me)
// with a real session cookie.

import { test, expect } from '../fixtures/test';
import { fetchMagicLinkFor } from '../fixtures/mailpit';

test('a brand-new visitor signs in via magic link', async ({ page }) => {
  const email = `newcomer-${Date.now()}@e2e.local`;

  // Step 1: type email into the login form.
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);

  // Step 2: submit and wait for the form-action response specifically.
  // Waiting on text alone is racy because the SvelteKit form action
  // can take 10–20s when Supabase signInWithOtp is slow; a network-
  // level wait is deterministic. 30s timeout covers the slowest end
  // of the observed signInWithOtp tail.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/login') && r.request().method() === 'POST',
      { timeout: 30_000 }
    ),
    page.getByRole('button', { name: /send|sign in/i }).click()
  ]);
  expect(response.status()).toBeLessThan(500);

  // Step 3: the rendered acknowledgement now follows synchronously.
  await expect(page.getByText(/check.*email/i)).toBeVisible();

  // Step 4: Mailpit catches the magic link Supabase sent.
  const link = await fetchMagicLinkFor(email);
  expect(link).toContain('/auth/');

  // Step 5: follow it. The browser ends up authenticated, on a page
  // that recognizes the new user (onboarding because they have no
  // handle yet).
  await page.goto(link);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: /claim a handle/i })).toBeVisible();
});

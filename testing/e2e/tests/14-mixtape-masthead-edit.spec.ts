// 14-mixtape-masthead-edit: per-mixtape inline edit affordances on
// /{handle}. Owner sees pencils on the h1 and description, and the
// `editName` / `editDescription` server actions write to the
// mixtapes table. Visitors see the new values but no controls.
//
// Mirrors 11-steward-inline-edit (same InlineEdit component, same
// shape of action) — but the gate here is `requireMixtapeOwner`
// rather than `requireGroupRole`. The negative path (anon visitor
// POSTing to ?/editName) proves that gate is wired up.

import { test, expect } from '../fixtures/test';
import { awaitHydrated } from '../helpers/hydration';

test(
  'owner edits mixtape title and description; visitor sees the new values',
  { tag: ['@feature:public', '@role:creator'] },
  async ({ creator, visitor }) => {
    // Default title is "{Display}'s mixtape" — no custom name yet.
    await creator.page.goto(`/${creator.handle}`);
    await awaitHydrated(creator.page);
    await expect(
      creator.page.getByRole('heading', { level: 1, name: `${creator.displayName}'s mixtape` })
    ).toBeVisible();

    // ── Title: pencil → input → save ───────────────────────────────
    await creator.page.getByRole('button', { name: /edit mixtape title/i }).click();
    // InlineEdit renders an sr-only <label> tying to the input by id.
    // getByLabel is refactor-resilient: no hardcoded selectors.
    await creator.page.getByLabel('Mixtape title').fill('Songs for a slow morning');
    await creator.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      creator.page.getByRole('heading', { level: 1, name: 'Songs for a slow morning' })
    ).toBeVisible();

    // ── Description: "Add a description" → textarea → save ────────
    await creator.page.getByRole('button', { name: /add a description/i }).click();
    const description =
      'A handful of songs I keep coming back to when I want to take it easy.';
    await creator.page.getByLabel('Mixtape description').fill(description);
    await creator.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(creator.page.getByText(description)).toBeVisible();

    // ── Reload — both values persist via the mixtapes table. ──────
    await creator.page.reload();
    await awaitHydrated(creator.page);
    await expect(
      creator.page.getByRole('heading', { level: 1, name: 'Songs for a slow morning' })
    ).toBeVisible();
    await expect(creator.page.getByText(description)).toBeVisible();

    // ── Visitor sees the new values, no pencils. ──────────────────
    await visitor.page.goto(`/${creator.handle}`);
    await awaitHydrated(visitor.page);
    await expect(
      visitor.page.getByRole('heading', { level: 1, name: 'Songs for a slow morning' })
    ).toBeVisible();
    await expect(visitor.page.getByText(description)).toBeVisible();
    await expect(visitor.page.getByRole('button', { name: /edit mixtape title/i })).toHaveCount(0);
    await expect(visitor.page.getByRole('button', { name: /edit description/i })).toHaveCount(0);
  }
);

test(
  'anon POST to ?/editName cannot mutate the mixtape (owner-gate enforced)',
  { tag: ['@feature:public', '@role:viewer'] },
  async ({ creator, visitor }) => {
    // No session, no cookie. The form action's first guard is
    // `requireMixtapeOwner`, which throws redirect(303, '/login')
    // when there's no user. SvelteKit serializes that redirect into
    // its action-result body (HTTP 200 wrapper), so the testable
    // security property is "the mutation didn't happen" — assert
    // it via a fresh GET rather than the HTTP status code, which
    // would couple us to SvelteKit's response shape.
    await visitor.page.request.post(`/${creator.handle}?/editName`, {
      form: { name: 'Pwned by anon' }
    });

    // Original title still in place — the action never wrote.
    await visitor.page.goto(`/${creator.handle}`);
    await expect(
      visitor.page.getByRole('heading', { level: 1, name: `${creator.displayName}'s mixtape` })
    ).toBeVisible();
    await expect(visitor.page.getByRole('heading', { level: 1, name: /pwned/i })).toHaveCount(0);
  }
);

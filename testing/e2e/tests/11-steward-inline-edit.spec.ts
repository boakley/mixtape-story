// 11-steward-inline-edit: the steward's per-field affordances on
// /g/{slug}: inline name + description editing (pencils), collapsible
// steward-section, and HelpTip popovers on the invite-form fields.
//
// All single-creator (Sam = steward). The non-steward gating is
// enforced server-side in the action and is verified separately by the
// per-route gate tests (TODO: 12-non-steward.spec.ts when we cover
// negative paths).

import { test, expect } from '../fixtures/test';
import { workerGroupSlug } from '../fixtures/auth';
import { createGroup } from '../pages/group';

test(
  'steward edits name + description, collapses section, uses HelpTip',
  { tag: ['@feature:group', '@role:steward'] },
  async ({ creator }) => {
    const slug = workerGroupSlug('edit-circle');
    const group = await createGroup(creator.page, {
      slug,
      name: 'E2E Edit Circle',
      description: 'Initial description we will rewrite.'
    });

    // ── Inline name editing ────────────────────────────────────────
    // Pencil click → input → save → h1 reappears with the new value.
    await group.editName('E2E Edit Circle (renamed)');
    await expect(
      creator.page.getByRole('heading', { level: 1, name: 'E2E Edit Circle (renamed)' })
    ).toBeVisible();

    // ── Inline description editing ────────────────────────────────
    const newDesc = 'A working description for the writing group.';
    await group.editDescription(newDesc);
    await expect(creator.page.getByText(newDesc)).toBeVisible();

    // ── Steward section: collapsible, defaults closed ─────────────
    const toggle = group.stewardSectionToggle();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Header text reflects the count (0 active codes at this point).
    await expect(toggle).toContainText(/No active invite codes/i);

    // Click expands — body becomes visible with the invite form.
    await group.expandStewardSection();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(group.stewardSectionBody()).toBeVisible();
    await expect(creator.page.locator('input[name="code"]')).toBeVisible();

    // Click again collapses.
    await group.collapseStewardSection();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(group.stewardSectionBody()).toHaveCount(0);

    // ── HelpTip behavior ──────────────────────────────────────────
    await group.expandStewardSection();

    // Open the Code field's tooltip → text visible.
    await group.openHelpTip('Code');
    await expect(group.openTooltip()).toBeVisible();
    await expect(group.openTooltip()).toContainText(/lowercase letters, digits/i);

    // Open a different field's tooltip → only one stays open at a time
    // (each HelpTip closes on document click; clicking another (?) IS
    // a document click in the sense that closes the prior popover before
    // opening the new one's). End state: exactly one tooltip visible.
    await group.openHelpTip('Expires in (days)');
    await expect(group.openTooltip()).toBeVisible();
    await expect(group.openTooltip()).toContainText(/365 days/i);
    await expect(creator.page.getByRole('tooltip')).toHaveCount(1);

    // Esc closes the open tooltip.
    await creator.page.keyboard.press('Escape');
    await expect(creator.page.getByRole('tooltip')).toHaveCount(0);
  }
);

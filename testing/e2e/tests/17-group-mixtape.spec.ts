// 17-group-mixtape: a creator makes a mixtape *for a group* — born on
// the group's page, slugged after the group, optionally seeded from a
// copy of an existing mixtape, and fully independent from then on.
// This is the v1.5 journey: one person, two audiences, two mixtapes.
//
// Written red-first against the planned accessibility surface (see
// the v1.5 plan + ~/mixtape-user-journey.html): the journey doc's
// green tags are the names asserted here.

import { test, expect } from '../fixtures/test';
import { workerGroupSlug } from '../fixtures/auth';
import { Mixtape } from '../pages/mixtape';
import { createGroup } from '../pages/group';

test(
  'a creator starts a blank mixtape just for a group',
  { tag: ['@feature:group', '@feature:editor', '@role:creator'] },
  async ({ creator }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);

    const slug = workerGroupSlug('family');
    const group = await createGroup(creator.page, { slug, name: 'The Family Table' });

    // The creation flow lives on the group page, not in a global menu.
    await creator.page.getByRole('link', { name: 'Make a mixtape just for this group' }).click();
    await creator.page.waitForURL(`**/g/${slug}/new-mixtape`);

    // Name prefilled from the group; Blank is the default start.
    await expect(creator.page.getByLabel('Mixtape name', { exact: true })).toHaveValue(
      'The Family Table mixtape'
    );
    await expect(creator.page.getByRole('radio', { name: 'Blank' })).toBeChecked();

    const nameInput = creator.page.getByLabel('Mixtape name', { exact: true });
    await nameInput.fill('Family Cuts');
    await creator.page.getByRole('button', { name: 'Create mixtape' }).click();

    // Blank mixtapes land in their editor — there's nothing to read yet.
    await creator.page.waitForURL(`**/${creator.handle}/${slug}/_edit`);

    const familyMixtape = new Mixtape(creator.page, creator.handle, creator.displayName, {
      slug,
      name: 'Family Cuts'
    });
    await familyMixtape.addSongsByList(['Thunder Road - Bruce Springsteen']);

    // The group card now shows the group-born mixtape, not the primary.
    await creator.visitGroup(slug);
    const card = creator.page.locator(
      `[data-testid="member-card"][data-handle="${creator.handle}"]`
    );
    await expect(card).toContainText('Family Cuts');

    // The secondary reader is its own page with its own identity.
    await familyMixtape.open();
    await expect(familyMixtape.title()).toBeVisible();
    await expect(creator.page.getByText('A mixtape by Sam')).toBeVisible();
    await expect(creator.page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Family Cuts'
    );

    // The primary is untouched by any of this.
    await creator.mixtape.open();
    await expect(creator.mixtape.title()).toBeVisible();
    await expect(await creator.mixtape.songCount()).toBe(1);

    // The menu lists both, primary first.
    await creator.page.getByRole('button', { name: 'Open menu' }).click();
    const menuLinks = creator.page.getByRole('link', {
      name: /Sam's mixtape|Family Cuts/
    });
    await expect(menuLinks).toHaveCount(2);
    await expect(menuLinks.first()).toHaveAccessibleName("Sam's mixtape");
    await expect(menuLinks.last()).toHaveAccessibleName('Family Cuts');
  }
);

test(
  'a copy-seeded group mixtape starts full and diverges freely',
  { tag: ['@feature:group', '@feature:editor', '@role:creator'] },
  async ({ creator }) => {
    // Primary: two songs, one with a story and a memory year.
    await creator.mixtape.addSongsByList([
      'Born in the U.S.A. - Bruce Springsteen',
      'Purple Rain - Prince'
    ]);
    await creator.mixtape.writeStory(1, 'Dad played this every Saturday.', 1989);

    const slug = workerGroupSlug('family');
    const group = await createGroup(creator.page, { slug, name: 'The Family Table' });
    await group.makeGroupMixtape({ copyOf: "Sam's mixtape" });

    // A copy has content, so it lands back on the group page.
    await creator.page.waitForURL(`**/g/${slug}`);

    const copy = new Mixtape(creator.page, creator.handle, creator.displayName, {
      slug,
      name: 'The Family Table mixtape'
    });

    // The copy carries songs, story, and memory year.
    await copy.open();
    await expect(creator.page.getByRole('button', { name: /expanded/i })).toBeVisible();
    await creator.page.getByRole('button', { name: /expanded/i }).click();
    await expect(creator.page.getByText('Born in the U.S.A.')).toBeVisible();
    await expect(creator.page.getByText('Purple Rain')).toBeVisible();
    await expect(creator.page.getByText('Dad played this every Saturday.')).toBeVisible();
    await expect(creator.page.getByText(/reminds me of 1989/)).toBeVisible();

    // Diverge the copy: retell the story for the family audience.
    await copy.writeStory(1, 'The version with Dad in it.');
    await creator.mixtape.open();
    await creator.page.getByRole('button', { name: /expanded/i }).click();
    await expect(creator.page.getByText('Dad played this every Saturday.')).toBeVisible();
    await expect(creator.page.getByText('The version with Dad in it.')).toHaveCount(0);

    // Diverge the primary: delete a song there; the copy keeps it.
    await creator.mixtape.deleteSong(2);
    await copy.open();
    await expect(creator.page.getByText('Purple Rain')).toBeVisible();
  }
);

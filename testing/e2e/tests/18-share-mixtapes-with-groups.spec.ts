// 18-share-mixtapes-with-groups: the share model under multiple
// mixtapes. A member shows each group exactly one mixtape — their
// primary or their version-for-that-group; the primary can live in
// many groups at once; and two members' overlapping picks finally
// exercise the "Songs we share" aggregation across real actors.

import { test, expect } from '../fixtures/test';
import { workerGroupSlug, seedUser, seedSong, seedGroupMember } from '../fixtures/auth';
import { createGroup } from '../pages/group';

test(
  'a member shows each group a different mixtape, one per group',
  { tag: ['@feature:group', '@role:member', '@role:creator'] },
  async ({ creator }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);

    // Group A gets the primary — today's flow, unchanged.
    const slugA = workerGroupSlug('writing');
    const groupA = await createGroup(creator.page, { slug: slugA, name: 'Writing Circle' });
    await groupA.shareMyMixtape();
    await expect(groupA.memberCard(creator.handle)).toContainText("Sam's mixtape");

    // Group B gets a group-born copy.
    const slugB = workerGroupSlug('family');
    const groupB = await createGroup(creator.page, { slug: slugB, name: 'The Family Table' });
    await groupB.makeGroupMixtape({ copyOf: "Sam's mixtape" });
    await creator.page.waitForURL(`**/g/${slugB}`);

    // Each group's card names and links the right mixtape.
    const cardB = groupB.memberCard(creator.handle);
    await expect(cardB).toContainText('The Family Table mixtape');
    // The card itself is the link.
    await expect(cardB).toHaveAttribute('href', `/${creator.handle}/${slugB}`);
    await creator.visitGroup(slugA);
    await expect(groupA.memberCard(creator.handle)).toHaveAttribute(
      'href',
      `/${creator.handle}`
    );

    // The per-group cap: while a mixtape is shared here, the only
    // share affordance is stopping.
    await creator.visitGroup(slugB);
    await expect(
      creator.page.getByRole('button', { name: /stop sharing my mixtape with this group/i })
    ).toBeVisible();
    await expect(
      creator.page.getByRole('button', { name: /^share my mixtape with this group/i })
    ).toHaveCount(0);

    // Stop sharing in B, then reshare via the chooser — the one place
    // a select appears, because two mixtapes are now candidates.
    await groupB.unshareMyMixtape();
    await expect(creator.page.getByLabel('Mixtape to share')).toBeVisible();
    await groupB.shareMyMixtape('The Family Table mixtape');
    await expect(groupB.memberCard(creator.handle)).toContainText('The Family Table mixtape');
  }
);

test(
  "two members' overlapping picks meet in Songs we share",
  { tag: ['@feature:group', '@role:member', '@role:creator'] },
  async ({ creator }) => {
    // Creator's primary has the overlapping song, shared to the group.
    await creator.mixtape.addSongsByList(['Born to Run - Bruce Springsteen']);
    const slug = workerGroupSlug('overlap');
    const group = await createGroup(creator.page, { slug, name: 'Overlap Circle' });
    await group.shareMyMixtape();

    // Second member seeded at the data layer (the invite-join journey
    // has its own coverage in 08; it isn't the subject here).
    const tim = await seedUser({ baseHandle: 'tim', displayName: 'Tim' });
    await seedSong(tim.id, { title: 'Born to Run', artist: 'Bruce Springsteen' });
    await seedGroupMember(slug, tim.id);

    await creator.visitGroup(slug);
    await group.tab('Songs we share').click();

    const entry = creator.page.locator('[data-testid="song-entry"]');
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('Born to Run');
    await expect(entry).toContainText(/Picked by (Sam and Tim|Tim and Sam)/);
  }
);

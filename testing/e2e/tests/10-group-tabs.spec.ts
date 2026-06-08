// 10-group-tabs: the Phase 3b landing — three tabs (Member mixtapes /
// Songs we share / All songs), per-tab content, view toggle, click-to-
// expand-in-compact, story truncation, ListenWithChip, and tab
// persistence across reload.
//
// Single-creator scenario: Sam shares a 2-song mixtape with one short
// story and one truncation-triggering long story. Songs-we-share is
// exercised at its empty state (single contributor) since the dedup
// math is covered by the unit tests in story-truncate.test.ts.

import { test, expect } from '../fixtures/test';
import { workerGroupSlug } from '../fixtures/auth';
import { createGroup } from '../pages/group';

const SHORT_STORY = 'A song my grandmother loved. She hummed it doing dishes.';
const LONG_STORY =
  'My older brother had this song on a mixtape he made me in 1986, the summer I turned twelve. ' +
  'I played it in my Walkman so many times the tape stretched and the high end went thin. ' +
  "There's a moment in the second verse where the harmony falls apart and finds itself again " +
  "that I still hear in my chest sometimes when I'm out walking late.";

test(
  'three tabs render, persist, and respect view + truncation',
  { tag: ['@feature:group', '@role:steward'] },
  async ({ creator }) => {
    const slug = workerGroupSlug('tabs-circle');

    // Seed: two songs with deliberately different story lengths so we
    // can verify [more]/[less] only appears for the long one.
    await creator.mixtape.addSongsByList([
      'Wish You Were Here - Pink Floyd',
      'Imagine - John Lennon'
    ]);
    await creator.mixtape.writeStory(1, SHORT_STORY);
    await creator.mixtape.writeStory(2, LONG_STORY);

    const group = await createGroup(creator.page, { slug, name: 'E2E Tabs Circle' });
    await group.shareMyMixtape();

    // ── Tab strip structure ────────────────────────────────────────
    await expect(group.tab('Member mixtapes')).toBeVisible();
    await expect(group.tab('Songs we share')).toBeVisible();
    await expect(group.tab('All songs')).toBeVisible();
    expect(await group.activeTabName()).toBe('Member mixtapes');

    // Member-mixtapes tab: the directory row carries the chevron and
    // the title attribute we just added — verify both.
    const card = group.memberCard(creator.handle);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('title', /Open Sam's mixtape/);

    // View toggle and ListenWithChip should NOT be visible on the
    // Member mixtapes tab (no per-song surface to need them).
    await expect(group.viewButton('Expanded')).toHaveCount(0);
    await expect(creator.page.getByText(/^Listen with:/)).toHaveCount(0);

    // ── Songs we share tab: single contributor → empty-state nudge ─
    await group.switchTab('Songs we share');
    expect(await group.activeTabName()).toBe('Songs we share');
    await expect(creator.page.getByText(/No shared songs yet\./)).toBeVisible();

    // ── All songs tab: both songs render ──────────────────────────
    await group.switchTab('All songs');
    expect(await group.activeTabName()).toBe('All songs');
    await expect(group.songRow('Wish You Were Here')).toBeVisible();
    await expect(group.songRow('Imagine')).toBeVisible();

    // ── View toggle visible on song tabs; default compact ─────────
    await expect(group.viewButton('Expanded')).toBeVisible();
    await expect(group.viewButton('Compact')).toBeVisible();
    await expect(group.viewButton('Compact')).toHaveAttribute('aria-pressed', 'true');

    // Listen with chip is visible on song tabs.
    await expect(creator.page.getByText(/^Listen with:/)).toBeVisible();

    // ── Click-to-expand in compact ────────────────────────────────
    // In compact view, stories are hidden until the song row is clicked.
    // The "from {Sam}" attribution line is only inside the story block.
    const imagineRow = group.songRow('Imagine');
    await expect(imagineRow.getByText(/^from /)).toHaveCount(0);
    await group.expandSongInCompact('Imagine');
    await expect(imagineRow.getByText(/^from /)).toBeVisible();

    // ── Story truncation: long story shows [more] ─────────────────
    // The long story's excerpt is the first 2 sentences; [more] reveals
    // the rest. The short story (single sentence) shows no toggle.
    await expect(group.storyMoreToggle('Imagine')).toBeVisible();
    await group.expandSongInCompact('Wish You Were Here');
    await expect(group.storyMoreToggle('Wish You Were Here')).toHaveCount(0);

    // Click [more] → [less], full text becomes visible.
    await group.storyMoreToggle('Imagine').click();
    await expect(group.storyMoreToggle('Imagine')).toHaveText(/\[less\]/i);
    await expect(imagineRow.getByText(/walking late/)).toBeVisible(); // tail of LONG_STORY

    // ── Switching to Expanded reveals all stories without click ───
    await group.setView('expanded');
    // Re-load the page state — re-fetch the rows after view swap.
    await expect(group.viewButton('Expanded')).toHaveAttribute('aria-pressed', 'true');
    // Expanded mode always shows stories; no per-row click needed.
    await expect(
      group.songRow('Wish You Were Here').getByText(/^from /)
    ).toBeVisible();

    // ── Persistence: active tab + view survive reload (localStorage) ─
    // Re-hydration runs in onMount / $effect, so the post-reload state
    // updates after the initial paint. Auto-waiting toHaveAttribute
    // covers that small async chain — a single activeTabName() snapshot
    // would race the hydration.
    await creator.page.reload();
    await expect(group.tab('All songs')).toHaveAttribute('aria-selected', 'true');
    await expect(group.viewButton('Expanded')).toHaveAttribute('aria-pressed', 'true');
  }
);

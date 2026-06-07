// 03-write-stories: with a populated mixtape, the creator writes a
// story for one of the songs. The public page in expanded view
// renders the rich text.

import { test, expect } from '../fixtures/test';

test.skip('a creator writes a story for a song', async ({ creator }) => {
  // Seed: one song to attach a story to.
  await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);

  // Step 1: open the story editor for the first row.
  await creator.mixtape.writeStory(
    1,
    'The summer I had nothing figured out and walked everywhere.',
    2004
  );

  // Step 2: visit the public page in expanded view; the story is there.
  await creator.mixtape.open();
  await creator.page.getByRole('button', { name: /expanded/i }).click();
  await expect(
    creator.page.getByText(/summer I had nothing figured out/i)
  ).toBeVisible();
  await expect(
    creator.page.getByText(/this song reminds me of 2004/i)
  ).toBeVisible();
});

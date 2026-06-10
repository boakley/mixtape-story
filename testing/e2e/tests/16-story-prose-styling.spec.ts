// 16-story-prose: a creator writes a richly formatted story and the
// public page renders it *styled*. This is the layer-2 contract test
// for the prose pipeline: markdown produced the right tags (pinned at
// unit level in markdown.test.ts), and the prose-story CSS actually
// binds to them. The class shipped as a phantom — referenced, never
// defined — for three phases because nothing asserted a computed
// style; multi-paragraph stories rendered as a wall of text and
// in-story links as plain text. These assertions encode the design
// decisions as numbers, so an undefined class, a selector that
// misses marked's output, or a preflight regression all fail loudly.

import { test, expect } from '../fixtures/test';

// Every shape marked can emit that prose-story styles: paragraphs,
// a list, a blockquote, a link. Shaped like real writing on purpose —
// single-paragraph seed stories are why 100x stress runs never saw
// the wall-of-text bug.
const STORY = [
  'First paragraph setting the scene.',
  '',
  'Second paragraph after a blank line — the spacing under test.',
  '',
  '- first list item',
  '- second list item',
  '',
  '> A quoted line for the blockquote treatment.',
  '',
  'A [styled link](https://example.com) closes it out.'
].join('\n');

// Design-language tokens, as computed values (16px base font):
const ACCENT = 'rgb(176, 74, 47)'; // --color-accent
const RULE = 'rgb(232, 227, 218)'; // --color-rule
const PARA_GAP = '12px'; // 0.75em

test(
  'a story with paragraphs, a list, a quote, and a link renders styled',
  { tag: ['@feature:editor', '@feature:public', '@role:creator'] },
  async ({ creator }) => {
    await creator.mixtape.addSongsByList(['Such Great Heights - The Postal Service']);
    await creator.mixtape.writeStory(1, STORY);

    await creator.mixtape.open();
    await creator.page.getByRole('button', { name: /expanded/i }).click();

    // The class is the contract under test here, so locating by it is
    // the point — not a violation of the a11y-surface selector rule.
    const story = creator.page.locator('.prose-story');

    // Paragraph rhythm: the second paragraph carries the gap.
    await expect(story.getByText(/Second paragraph after a blank line/)).toHaveCSS(
      'margin-top',
      PARA_GAP
    );

    // Link voice: accent underline, like every other link on the site.
    const link = story.getByRole('link', { name: 'styled link' });
    await expect(link).toHaveCSS('text-decoration-line', 'underline');
    await expect(link).toHaveCSS('text-decoration-color', ACCENT);

    // List shape: bullets exist and are visible as bullets.
    const list = story.locator('ul');
    await expect(list).toHaveCSS('list-style-type', 'disc');
    await expect(list.locator('li')).toHaveCount(2);

    // Blockquote: the quiet left-rule treatment.
    const quote = story.locator('blockquote');
    await expect(quote).toHaveCSS('border-left-color', RULE);
    await expect(quote).toHaveCSS('border-left-width', '2px');
  }
);

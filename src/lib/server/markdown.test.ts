import { describe, expect, it } from 'vitest';
import { renderStory } from './markdown';

// Layer 1 of the prose-pipeline contract: markdown in, the right tags
// out. Layer 2 (those tags actually picking up the prose-story CSS) is
// E2E spec 16 — computed-style assertions against the rendered page.

describe('renderStory', () => {
  it('renders blank-line-separated text as separate paragraphs', () => {
    const html = renderStory('First paragraph.\n\nSecond paragraph.');
    expect(html.match(/<p>/g)).toHaveLength(2);
  });

  it('renders single newlines as <br> (breaks: true)', () => {
    const html = renderStory('line one\nline two');
    expect(html.match(/<p>/g)).toHaveLength(1);
    expect(html).toContain('<br>');
  });

  it('renders https links with the hardened attributes', () => {
    const html = renderStory('A [styled link](https://example.com) here.');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('>styled link</a>');
  });

  it('neutralizes unsafe link protocols to bare text', () => {
    const html = renderStory('[click me](javascript:alert(1))');
    expect(html).not.toContain('<a');
    expect(html).toContain('click me');
  });

  it('escapes raw HTML the user typed', () => {
    const html = renderStory('hello <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops images entirely', () => {
    const html = renderStory('![alt text](https://example.com/img.png)');
    expect(html).not.toContain('<img');
  });

  it('renders lists and blockquotes', () => {
    const html = renderStory('- one\n- two\n\n> quoted line');
    expect(html).toContain('<ul>');
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('<blockquote>');
  });
});

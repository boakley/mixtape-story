import { marked } from 'marked';

// Sanitize user-written story HTML via marked-side controls — no DOM-dependent
// sanitizer (DOMPurify, jsdom, linkedom, etc.) because the Cloudflare Workers
// runtime our SSR runs in doesn't reliably surface a DOM API to them.
//
// Three defenses, all string-level:
//   1. Custom `html` token renderer escapes raw HTML (so <script> the user
//      pasted becomes &lt;script&gt;).
//   2. Custom `link` renderer rejects any href that isn't http(s), mailto,
//      a fragment, or a relative path; the rest get neutralized.
//   3. Custom `image` renderer drops images entirely (v1 stories are text;
//      images are an attack surface we don't need yet).
//
// Output is the only thing that flows into {@html} sinks on the public page.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_HREF = /^(?:https?:|mailto:|#|\/)/i;

const renderer = {
  // Drop raw HTML the user typed. Marked v18 splits these into `html` (block)
  // and inline-html spans; both come through this hook in the renderer.
  html(token: { text?: string; raw?: string }): string {
    return escapeHtml(token.text ?? token.raw ?? '');
  },
  // Validate every link's href before rendering.
  link(token: { href: string; title?: string | null; tokens: unknown[] }): string {
    const safe = SAFE_HREF.test(token.href) ? token.href : '';
    const inner = (marked as unknown as { Parser: { parseInline(tokens: unknown[]): string } })
      .Parser.parseInline(token.tokens);
    const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : '';
    if (!safe) return inner; // unsafe href: render bare text, no anchor
    return `<a href="${escapeHtml(safe)}"${titleAttr} rel="nofollow noopener" target="_blank">${inner}</a>`;
  },
  // No images in v1 stories.
  image(): string {
    return '';
  }
};

marked.use({
  gfm: true,
  breaks: true,
  renderer
});

export function renderStory(text: string): string {
  if (!text) return '';
  return marked.parse(text, { async: false }) as string;
}

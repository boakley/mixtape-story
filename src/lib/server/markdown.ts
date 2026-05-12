import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// `breaks: true` makes single newlines render as <br>, matching how people
// actually write in textareas. GFM is on for autolinks, strikethrough, etc.
//
// Marked v18 removed its built-in `sanitize` option; the recommended pattern
// is now to run the output through DOMPurify. We do that below, with a tight
// allowlist of tags + attributes appropriate for a prose-shaped story. This
// is the only place in the codebase that emits HTML to {@html} sinks — every
// story on the public /{handle} page flows through here.
marked.setOptions({
  gfm: true,
  breaks: true
});

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'em', 'strong', 'i', 'b', 'u', 's', 'del',
  'a',
  'ul', 'ol', 'li',
  'blockquote',
  'code', 'pre',
  'h1', 'h2', 'h3', 'h4'
];

const ALLOWED_ATTR = ['href', 'title'];

export function renderStory(text: string): string {
  if (!text) return '';
  const rawHtml = marked.parse(text, { async: false }) as string;
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only http(s) and mailto links; everything else (javascript:, data:, etc.)
    // is stripped. The regex applies to href/src-like attributes.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
    // Belt-and-suspenders: explicit forbid lists override the allowlist if
    // anything ever loosens above.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'img'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'style', 'src']
  });
  return clean;
}

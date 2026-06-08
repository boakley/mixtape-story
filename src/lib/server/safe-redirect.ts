// Whitelist-style validation for post-auth / post-onboarding redirect
// targets. We accept only local paths (starts with `/`, doesn't look
// like a protocol-relative URL or an external link). Anything else
// silently falls back to the provided default. This blocks the
// open-redirect class where a malicious invite link could send users
// to a phishing site after they click their magic link.
export function safeRedirect(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  // Must start with a single slash (not `//` or `/\`).
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  if (next.startsWith('/\\')) return fallback;
  return next;
}

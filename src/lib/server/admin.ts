import { env } from '$env/dynamic/private';

let _emails: Set<string> | null = null;
let _domains: Set<string> | null = null;

// ADMIN_EMAILS entries are exact emails, plus optional `*@domain`
// wildcards that grant the whole domain. The wildcard exists for the
// E2E suite (dev .env.local carries `*@e2e-admin.local` so seeded
// admin users with worker-unique emails work at any parallelism);
// prod's list is exact-only.
function parseAdminEmails(): { emails: Set<string>; domains: Set<string> } {
  if (_emails && _domains) return { emails: _emails, domains: _domains };
  const entries = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  _emails = new Set(entries.filter((e) => !e.startsWith('*@')));
  _domains = new Set(entries.filter((e) => e.startsWith('*@')).map((e) => e.slice(2)));
  return { emails: _emails, domains: _domains };
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const { emails, domains } = parseAdminEmails();
  const lower = email.toLowerCase();
  if (emails.has(lower)) return true;
  const at = lower.lastIndexOf('@');
  return at > 0 && domains.has(lower.slice(at + 1));
}

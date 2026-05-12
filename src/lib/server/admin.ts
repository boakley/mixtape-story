import { env } from '$env/dynamic/private';

let _emails: Set<string> | null = null;

function adminEmails(): Set<string> {
  if (_emails) return _emails;
  const raw = env.ADMIN_EMAILS ?? '';
  _emails = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return _emails;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.toLowerCase());
}

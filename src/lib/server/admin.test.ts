import { describe, expect, it, vi } from 'vitest';

// isAdminEmail caches its parsed allowlist in module scope, so each
// case re-imports the module fresh with its own env. vi.doMock (not
// vi.mock) on purpose: it isn't hoisted, so each call's allowlist
// applies to the import that follows it.
async function isAdmin(allowlist: string, email: string | null): Promise<boolean> {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env: { ADMIN_EMAILS: allowlist } }));
  const { isAdminEmail } = await import('./admin');
  return isAdminEmail(email);
}

describe('isAdminEmail', () => {
  it('matches exact entries, case-insensitively', async () => {
    expect(await isAdmin('bryan@example.com', 'Bryan@Example.com')).toBe(true);
    expect(await isAdmin('bryan@example.com', 'mallory@example.com')).toBe(false);
  });

  it('matches *@domain wildcards by domain only', async () => {
    expect(await isAdmin('*@e2e-admin.local', 'anyone-w42@e2e-admin.local')).toBe(true);
    expect(await isAdmin('*@e2e-admin.local', 'anyone@e2e.local')).toBe(false);
    // The wildcard grants the WHOLE domain — never use one for a
    // domain where untrusted parties can register addresses.
    expect(await isAdmin('*@e2e-admin.local', 'literally-anyone@e2e-admin.local')).toBe(true);
  });

  it('mixed list: exacts and wildcards coexist', async () => {
    const list = 'bryan@example.com, *@e2e-admin.local';
    expect(await isAdmin(list, 'bryan@example.com')).toBe(true);
    expect(await isAdmin(list, 'admin-w7-123@e2e-admin.local')).toBe(true);
    expect(await isAdmin(list, 'stranger@example.com')).toBe(false);
  });

  it('rejects null/empty and an empty allowlist', async () => {
    expect(await isAdmin('bryan@example.com', null)).toBe(false);
    expect(await isAdmin('', 'bryan@example.com')).toBe(false);
  });
});

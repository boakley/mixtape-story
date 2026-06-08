// Resolves env vars for the test process. The fixtures read these to
// talk to the local Supabase stack; the tests themselves never see them.
//
// We pull from .env.local because that's the same file the SvelteKit
// dev server reads. The CLI sets these when you run `supabase start`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Missing .env.local is fine in CI; values are expected via the
    // environment directly.
  }
}

loadEnvLocal();

function require_(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Run \`supabase start\` and check .env.local.`);
  return v;
}

export const env = {
  supabaseUrl: require_('PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: require_('PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: require_('SUPABASE_SERVICE_ROLE_KEY'),
  siteUrl: process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173',
  mailpitUrl: process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
};

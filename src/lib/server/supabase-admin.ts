import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

let _client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. RLS-bypassing — only call this from server-only
 * code (admin endpoints, the migration script). Never expose to the browser.
 */
export function adminClient(): SupabaseClient {
  if (_client) return _client;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  _client = createClient(PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false }
  });
  return _client;
}

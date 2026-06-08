import { env } from '$env/dynamic/private';
import { isAdminEmail } from './admin';

// Feature flags read at request time from the environment. Off by default;
// a route or load function flips a feature on for itself by checking
// `isFeatureEnabled('groups')`. `+layout.server.ts` exposes the same map
// to client code so UI affordances can be hidden when a feature is off.
//
// Truthy values: "1", "true", "yes", "on" (case-insensitive). Everything
// else (including empty) is off. Keeping the parsing forgiving means
// `.dev.vars`, `.env.local`, and Cloudflare secrets all behave the same.
//
// Admin bypass: a feature that's globally off is still available to
// admin users (see ADMIN_EMAILS). So a feature can be deployed to prod
// without exposing it to regular users while still being testable on
// the real domain and data. Server routes that have access to the
// request's user should call `isFeatureAvailable(key, user)` rather
// than the bare `isFeatureEnabled(key)` — the latter is the env-only
// check, useful for tests and for getFeatures' anonymous fallback.

export type FeatureKey = 'groups';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

// Exported for testability — the env-wiring below is one line, but the
// parsing rule (case-insensitive, whitespace-tolerant, anything not in
// the allowlist is false) is the part worth pinning down.
export function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY.has(value.trim().toLowerCase());
}

export function isFeatureEnabled(key: FeatureKey): boolean {
  switch (key) {
    case 'groups':
      return isTruthy(env.FEATURES_GROUPS);
  }
}

/**
 * Is this feature available to this user?
 *
 * Returns true if the global env flag is on (everyone gets it) or if
 * the user is an admin (admin bypass for in-prod testing of a feature
 * that's globally off). Pass null/undefined for unauthenticated
 * requests — they only see features the env flag has enabled.
 */
export function isFeatureAvailable(
  key: FeatureKey,
  user: { email?: string | null } | null | undefined
): boolean {
  if (isFeatureEnabled(key)) return true;
  return isAdminEmail(user?.email);
}

/**
 * Snapshot every flag's availability for one user, for layout-load to
 * pass to the client. UI affordances key off this; admin sees the
 * affordances for features they have access to via bypass.
 */
export function getFeatures(
  user: { email?: string | null } | null | undefined
): Record<FeatureKey, boolean> {
  return {
    groups: isFeatureAvailable('groups', user)
  };
}

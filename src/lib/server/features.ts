import { env } from '$env/dynamic/private';

// Feature flags read at request time from the environment. Off by default;
// a route or load function flips a feature on for itself by checking
// `isFeatureEnabled('groups')`. `+layout.server.ts` exposes the same map
// to client code so UI affordances can be hidden when a feature is off.
//
// Truthy values: "1", "true", "yes", "on" (case-insensitive). Everything
// else (including empty) is off. Keeping the parsing forgiving means
// `.dev.vars`, `.env.local`, and Cloudflare secrets all behave the same.

export type FeatureKey = 'groups';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY.has(value.trim().toLowerCase());
}

export function isFeatureEnabled(key: FeatureKey): boolean {
  switch (key) {
    case 'groups':
      return isTruthy(env.FEATURES_GROUPS);
  }
}

// Snapshot all flags in one shot — convenient for layout-load to send to
// the client without per-key calls. Add keys here as new features land.
export function getFeatures(): Record<FeatureKey, boolean> {
  return {
    groups: isFeatureEnabled('groups')
  };
}

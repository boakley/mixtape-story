import type { SupabaseClient, Session, User } from '@supabase/supabase-js';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      supabase: SupabaseClient;
      safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
    }
    interface PageData {
      session?: Session | null;
      user?: User | null;
      viewerHandle?: string | null;
      isAdmin?: boolean;
    }
    // Minimal shape for the Cloudflare Workers ExecutionContext we need —
    // `waitUntil` keeps the Worker alive past the response so fire-and-forget
    // fetches (e.g. the render-og trigger) finish before the isolate exits.
    interface Platform {
      context?: {
        waitUntil(promise: Promise<unknown>): void;
      };
    }
  }
}

export {};

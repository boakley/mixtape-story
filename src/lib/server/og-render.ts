import type { RequestEvent } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SITE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

// Fire-and-forget trigger for the `render-og` Supabase Edge Function.
// Called from SvelteKit form actions after any write that affects the OG
// composition for a mixtape: add/remove/edit/reorder songs, change metadata,
// claim a handle. The Edge Function does the SVG-fetch → rasterize → upload
// to Storage work; this helper just kicks it off and returns immediately.
//
// In Cloudflare Workers, a fetch started but not awaited risks cancellation
// when the request handler returns — the isolate exits. `event.platform
// .context.waitUntil(promise)` extends the lifetime until the promise
// settles, which is exactly what we need for an async render that the user
// shouldn't have to wait on.
//
// Failure swallowing is intentional: the user's write should never fail
// because the OG render failed. Stale OGs propagate within the Storage
// cache window (5 minutes), and the next successful write retries.
export function triggerOgRender(
  handle: string,
  event: Pick<RequestEvent, 'fetch' | 'platform'>
): void {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn('[og-render] SUPABASE_SERVICE_ROLE_KEY not set; skipping render');
    return;
  }

  // In local dev, the Edge Function (running inside the Supabase Docker
  // stack) can't reach the SvelteKit dev server at `localhost:5173` — the
  // container's localhost is itself, not the host. `host.docker.internal`
  // is the canonical Docker-for-Mac/Windows escape hatch.
  const callbackBaseUrl = PUBLIC_SITE_URL.includes('localhost')
    ? PUBLIC_SITE_URL.replace('localhost', 'host.docker.internal')
    : PUBLIC_SITE_URL;

  const url = `${PUBLIC_SUPABASE_URL}/functions/v1/render-og`;

  const work = event
    .fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ handle, baseUrl: callbackBaseUrl })
    })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`[og-render] non-2xx for ${handle}: ${res.status} ${text}`);
      }
    })
    .catch((err) => {
      console.warn(`[og-render] fetch failed for ${handle}:`, err);
    });

  event.platform?.context?.waitUntil?.(work);
}

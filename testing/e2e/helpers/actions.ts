import type { Page, Response } from '@playwright/test';

/**
 * Run `trigger` (usually a click) and wait for the SvelteKit form
 * action it fires, then assert the action actually succeeded.
 *
 * Waiting on the response alone isn't enough: enhance-submitted
 * actions respond HTTP 200 even when the action returned
 * `fail(...)` — the failure lives in the ActionResult body
 * (`{type: 'failure', status, data}`). Under stress runs the local
 * Supabase gateway can 500, the action correctly propagates it, and
 * a response-only wait lets the test sail past the real error into a
 * confusing downstream assertion (seen in the 2026-06-09 ×100 run).
 * This helper fails fast at the failing step with the action's own
 * error payload.
 *
 * Infra-shaped failures (5xx — gateway hiccups, pool exhaustion)
 * are retried once after a short pause by re-running `trigger`.
 * App-shaped failures (4xx validation etc.) throw immediately —
 * retrying those would hide real bugs. Caveat: if the 500 landed
 * *after* the DB commit, the retry can surface a duplicate-style
 * app failure (e.g. "slug taken" from createGroup) — rare, and it
 * fails loudly with the true cause one hop away.
 */
export async function actAndExpectSuccess(
  page: Page,
  action: string,
  trigger: () => Promise<void>,
  opts: { retries?: number; retryDelayMs?: number } = {}
): Promise<Response> {
  const { retries = 1, retryDelayMs = 3_000 } = opts;

  for (let attempt = 0; ; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(action) && r.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      trigger()
    ]);

    const failure = await classifyActionResponse(response, action);
    if (!failure) return response;
    if (failure.kind === 'app' || attempt >= retries) throw failure.error;

    // Infra blip (5xx) — give the local stack a beat and re-trigger.
    await page.waitForTimeout(retryDelayMs);
  }
}

type ActionFailure = { kind: 'infra' | 'app'; error: Error };

/**
 * Inspect a form-action response. Returns null on success/redirect,
 * otherwise a failure classified as infra (5xx — retryable) or app
 * (anything else — not retryable).
 */
async function classifyActionResponse(
  response: Response,
  action: string
): Promise<ActionFailure | null> {
  // A no-JS (non-enhanced) post answers success with a 303 redirect.
  if (response.status() === 303) return null;

  if (!response.ok()) {
    const error = new Error(`${action} action failed: HTTP ${response.status()}`);
    return { kind: response.status() >= 500 ? 'infra' : 'app', error };
  }

  let body: { type?: string; status?: number; data?: unknown };
  try {
    body = JSON.parse(await response.text());
  } catch {
    return null; // not an ActionResult payload; HTTP status already vouched for it
  }
  if (!body.type || body.type === 'success' || body.type === 'redirect') return null;

  const error = new Error(
    `${action} action returned ${body.type} (status ${body.status}): ${JSON.stringify(body.data)}`
  );
  return { kind: (body.status ?? 0) >= 500 ? 'infra' : 'app', error };
}

/** Assert a form-action response is a success or redirect (no retry). */
export async function expectActionSuccess(response: Response, action: string): Promise<void> {
  const failure = await classifyActionResponse(response, action);
  if (failure) throw failure.error;
}

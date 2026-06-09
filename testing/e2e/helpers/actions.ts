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
 */
export async function actAndExpectSuccess(
  page: Page,
  action: string,
  trigger: () => Promise<void>
): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(action) && r.request().method() === 'POST',
      { timeout: 15_000 }
    ),
    trigger()
  ]);
  await expectActionSuccess(response, action);
  return response;
}

/** Assert a form-action response is a success or redirect. */
export async function expectActionSuccess(response: Response, action: string): Promise<void> {
  // A no-JS (non-enhanced) post answers success with a 303 redirect.
  if (response.status() === 303) return;
  if (!response.ok()) {
    throw new Error(`${action} action failed: HTTP ${response.status()}`);
  }
  let body: { type?: string; status?: number; data?: unknown };
  try {
    body = JSON.parse(await response.text());
  } catch {
    return; // not an ActionResult payload; HTTP status already vouched for it
  }
  if (body.type && body.type !== 'success' && body.type !== 'redirect') {
    throw new Error(
      `${action} action returned ${body.type} (status ${body.status}): ${JSON.stringify(body.data)}`
    );
  }
}
